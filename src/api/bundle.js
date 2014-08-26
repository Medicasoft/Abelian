/*! Copyright 2014 MedicaSoft LLC USA and Info World SRL
Licensed under the Apache License, Version 2.0 the "License";
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

var restify = require('restify'),
pg = require('pg'),
fs = require('fs'),
cp = require('child_process'),
guid = require('node-uuid'),
config = require('./config.js');

var connString = config.connString;
var baseUrl = config.baseUrl;
var tempPath = '/var/spool/direct/tmp/';
var toolsPath = '/var/spool/direct/tools/';

var qry_get_all = 'SELECT * FROM bundles';
var qry_get = 'SELECT * FROM bundles WHERE id=$1';
var qry_create = "INSERT INTO  bundles (local_domain_name, url, interval, last_run) values($1, $2, $3, $4) RETURNING id";
var qry_update_run = "UPDATE bundles SET last_run=$2 WHERE id=$1";
var qry_delete = "DELETE FROM bundles WHERE id=$1 RETURNING *";
var intervals = [];

module.exports = {
	registerRoutes : registerRoutes
};

initializeIntervals();
 
function rowToJson(row) {
	return {
		"id" : row.id,
		"local_domain_name" : row.local_domain_name,
		"url" : row.url,
		"interval" : row.interval,
		"last_run" : row.last_run
	};
}

function registerRoutes(server) {
	server.post('/Bundle', restify.bodyParser(), createBundle);
	server.get('/Bundles', getBundles);
	server.get('/Bundle/:id', getBundle);
	server.del('/Bundle/:id', deleteBundle);
}


function initializeIntervals() {
	pg.connect(connString, function (err, client, done) {
		if (err) {
			console.error('error fetching client from pool', err);
			return;
		} else {
			client.query(qry_get_all, function (err, result) {
				done();
				if (err) {
					console.error('error running query', err);
					return;
				}

				var totalResults = result.rows.length;

				for (var i = 0; i < totalResults; i++) {
					var bundle = rowToJson(result.rows[i]);
					intervals.push(bundleToInterval(bundle));
				}
				console.log("Loaded: ", totalResults, " bundle jobs.");
			});
		}
	});
}

function addInterval(bundle) {
	if (findInterval(bundle)) {
		return;
	} else {
		var interval = bundleToInterval(bundle);
		intervals.push(interval);
	}
}

function bundleToInterval(bundle) {
	var period = bundle.interval * 60 * 1000;
	var x = callAddBundle;
	var interval = setInterval(function() {x(bundle);}, period); 
	return {"id": bundle.id, "interval": interval};
}

function callAddBundle(bundle, req, res, next) {
	var cmd = toolsPath + 'direct_bundle';
	cmd += ' -d ' + bundle.local_domain_name;
	cmd += ' -u ' + bundle.url;
	cmd += ' add';
//	console.log('command: ', cmd);
	var child = cp.exec(cmd,
			function (err, stdout, stderr) {
			if (err) {
				console.error(' error calling direct_bundle: ', err);
				if (res) {
					res.send(500, err);
					return next();
				}
				return;
			}	
			if (stderr !== '') {
				console.error(' direct_bundle stderr : ' + stderr);
				if (res) {
					res.send(500, stderr);
					return next();
				}
				return;
			}
			updateLastRun(bundle, req, res, next);
		});
}

function callRemoveBundle(bundle, req, res, next) {
	var cmd = toolsPath + 'direct_bundle';
	cmd += ' -d ' + bundle.local_domain_name;
	cmd += ' -u ' + bundle.url;
	cmd += ' remove';
//	console.log('command: ', cmd);
	var child = cp.exec(cmd,
		function (err, stdout, stderr) {
			if (err) {
				console.error(' error calling direct_bundle: ', err);
				if (res) {
					res.send(500, err);
					return next();
				}
			}	
			if (stderr !== '') {
				console.error(' direct_bundle stderr: ' + stderr);
				if (res)
					res.send(500, stderr);
				return next();
			}
			if (res)
				res.send(204);
			return next();
		}
	);
	return next();
}

function findInterval(bundle) {
	for (var i = 0; i < intervals.length; i++) {
		if (intervals[i].id == bundle.id)
			return intervals[i];
	}
	return null;
}

function removeInterval(bundle) {
	var interval = findInterval(bundle);
	if (interval) {
		clearInterval(interval.interval);
		intervals.pop(interval);
	}
}


function updateLastRun(bundle, req, res, next) {
	pg.connect(connString, function (err, client, done) {
		if (err) {
			console.error('error fetching client from pool', err);
			if (res) {
				res.send(500, err);
				return next();
			}
			return;
		} else {
			var dt = new Date();
			client.query(qry_update_run, [bundle.id, dt], function (err, result) {
				done();
				if (err) {
					console.error('error running query', err);
					if (res) {
						res.send(500, err);
						return next();
					}
					return;
				}
				if (res) {
					res.send(200);
					console.log('Bundle update (id: ', bundle.id, 'domain: ', bundle.local_domain_name, ' url: ', bundle.url,
						 ' timestamp: ', dt,')');
					return next();
				}
				console.log('Bundle update (id: ', bundle.id, 'domain: ', bundle.local_domain_name, ' url: ', bundle.url,
					 ' timestamp: ', dt,')');
				return;
			});
		}
	});
}


function handleCreateBundle(req, res, next, result) {
	var bundle = req.body;
	bundle.id = result.rows[0].id;
	addInterval(bundle);
	callAddBundle(bundle, req, res, next);
	return next();
}

function createBundle(req, res, next) {
	if (typeof req.body.interval != "number" || req.body.interval < 1 || req.body.interval > 35791) {
		res.send(400, "Interval  must be an integer between 1 and 35791 (minutes)");
		return next();
	}
	 
	executeSql(req, res, next, qry_create, [req.body.local_domain_name, req.body.url, req.body.interval, null], handleCreateBundle);
}


function getBundle(req, res, next) {
	executeSql(req, res, next, qry_get, [req.params.id], handleGetBundle);
}

function handleGetBundle(req, res, next, result) {
	if (result.rowCount == 0) {
		res.send(404);
		return next();
	}
	var entity = rowToJson(result.rows[0]);
	res.send(200, entity);
	return next();
}

function deleteBundle(req, res, next) {
	executeSql(req, res, next, qry_delete, [req.params.id], handleDeleteBundle);
}

function handleDeleteBundle(req, res, next, result) {
	var bundle = rowToJson(result.rows[0]);
	removeInterval(bundle);
	callRemoveBundle(bundle, req, res, next);	
	return next();	
}

function getBundles(req, res, next) {
	executeSql(req, res, next, qry_get_all, [], handleGetBundles);
}

function handleGetBundles(req, res, next, result) {
	var totalResults = result.rows.length;
	var entities = {
		totalResults: totalResults,
		entry: []
	};

	for (var i = 0; i < totalResults; i++) {
		var row = result.rows[i];
		var entity = rowToJson(row);
		entities.entry.push({
			id: baseUrl + entity.id,
			content: entity
		});
	}
	res.send(200, entities);	
	return next();
}

function executeSql(req, res, next, query, params, callback) {
    pg.connect(connString, function (err, client, done) {
        if (err) {
            console.error('error fetching client from pool', err);
            res.send(500, err);
            return next();
        } else {
            client.query(query, params, function (err, result) {
                done();
                if (err) {
                    console.error('error running query', err);
                    res.send(500, err);
                    return next();
                }
                if (result.command == "UPDATE" && result.rowCount == 0) {
                    res.send(404);
                    return next();
                }
		if (result.command == "DELETE" && result.rowCount == 0) {
			res.send(404);
			return next();
		}
		if (result.command == "UPDATE" && result.rowCount == 0) {
			res.send(404);
			return next();
		}	
		if (result.command == "INSERT") {
                	res.setHeader('location', baseUrl + 'Bundle/' + result.rows[0].id);
                }
                return callback(req, res, next, result);
            });
        }
    });
}
