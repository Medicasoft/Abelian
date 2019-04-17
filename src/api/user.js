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
    config = require('./config.js'),
    async = require("async"),
    util = require("util"),
    resources = require("./resources");

var connString = config.connString;
var baseUrl = config.baseUrl;
var tempPath = '/var/spool/direct/tmp/';
var toolsPath = '/var/spool/direct/tools/';



module.exports = {
    registerRoutes : registerRoutes 
};

function registerRoutes(server) {
    server.get('/Users', getUsers);
    server.get('/User/:id', getUser);
    server.post('/User', restify.bodyParser(), createUser);
    server.put('/User/:id', restify.bodyParser(), updateUser);
    server.del('/User/:id', deleteUser);

    server.get('/Domains', getDomains);
    server.get('/Domain/:id', getDomain);
    server.post('/Domain', restify.bodyParser(), createDomain);
//    server.put('/Domain/:id', restify.bodyParser(), updateDomain);
    server.del('/Domain/:id', deleteDomain);
} 

//user routes
function getUsers(req, res, next) {
    resources.getEntities(req, res, next, 'User');
}
function getUser(req, res, next) {
    getEntity(req, res, next, 'User');
}
function createUser (req, res, next) {
    executeSql(req, res, next, 'User', 'create',  [req.body.address.toLowerCase(), req.body.certificate], 201);
}
function updateUser (req, res, next) {
    executeSql(req, res, next, 'User', 'update', [req.params.id, req.body.address.toLowerCase(), req.body.certificate], 200);
}
function deleteUser (req, res, next) {
    executeSql(req, res, next, 'User', 'delete', [req.params.id], 204);
}
    
//domain routes
function getDomains (req, res, next) {
    resources.getEntities(req, res, next, 'Domain');
}
function getDomain (req, res, next) {
    getEntity(req, res, next, 'Domain');
}
function createDomain (req, res, next) {
	if (!req.body.crypt_cert && req.body.cert_disco_algo == 'local') {
		res.send(400, 'crypt_cert required for local algorithm');
		return next();
	}
	if (req.body.crypt_cert) {
		var filepath = tempPath + guid.v4() + '.tmp';
		fs.writeFile(filepath, req.body.crypt_cert,function(err) {
			if (err) {
				console.error('Error while  writing temporary file: ' + err);
				res.send(500, err);
				return next();
			}
			
			callAddDomain(req, res, next, filepath);
			return next();
		});
		return next();
	}
	callAddDomain(req, res, next);
	return next();
}

function callAddDomain(req, res, next, filepath) {
	var command = toolsPath + 'direct_domain -d ' + req.body.name;
	if (req.body.cert_disco_algo)
		command += ' -a ' + req.body.cert_disco_algo;
	if (filepath)
		command += ' -c ' + filepath;
	if (req.body.is_local != undefined)
		command += ' -t ' + (req.body.is_local == false ? 'remote' : 'local');
	command += ' add';

		
	var child = cp.exec(command, function(err, stdout, stderr) {
                if (filepath) {
			fs.unlink(filepath, function (err) {
				if (err)
					console.error('Error removing temporary file: ' + err);
			});
		}

		if (stderr !== '') {
			console.error('direct_domain stderr: ' + stderr);
			res.send(500, stderr);
			return next();
		}
                if (stdout !== '') {
        			res.setHeader('location', baseUrl + 'Domain/' + stdout.trim());
                }
		res.send(201);
		return next();
	});
}

function deleteDomain(req, res, next) {
	var get_qry = resources['domain'].queries['get'];
	pg.connect(connString, function (err, client, done) {
	        if (err) {
	            console.error('error fetching client from pool', err);
	            res.send(500);
	            return next();
	        } else {
	            client.query(get_qry, [req.params.id], function (err, result) {
	                done();
	                if (err) {
	                    console.error('error running query', err);
	                    res.send(500);
	                    return next();
	                }
	                if (result.rowCount == 0) {
	                    res.send(404);
	                    return next();
	                }
			
			var child = cp.exec(toolsPath + 'direct_domain -d ' + result.rows[0].name + 
				' remove', function(err, stdout, stderr) {
				if (stderr !== '') {
					console.error('direct_domain stderr: ' + stderr);
					res.send(500, stderr);
					return next();
				}
				res.send(204);
				return next();
			});
			return next();
		   });
		}
	});
}




//DB helper functions
function getEntity(req, res, next, type) {
    var get_qry = resources[type.toLowerCase()].queries['get'];
    var entityToJson = resources[type.toLowerCase()].toJson;

    pg.connect(connString, function (err, client, done) {
        if (err) {
            console.error('error fetching client from pool', err);
            res.send(500);
            return next();
        } else {
            client.query(get_qry, [req.params.id], function (err, result) {
                done();
                if (err) {
                    console.error('error running query', err);
                    res.send(500);
                    return next();
                }
                if (result.rowCount == 0) {
                    res.send(404);
                    return next();
                }
                var entity = entityToJson(result.rows[0]);
                res.send(200, entity.content);
            });
        }
    });
}


function executeSql(req, res, next, type, queryType, params, successCode) {
    var qry = resources[type.toLowerCase()].queries[queryType];

    pg.connect(connString, function (err, client, done) {
        if (err) {
            console.error('error fetching client from pool', err);
            res.send(500);
            return next();
        } else {
            client.query(qry, params, function (err, result) {
                done();
                if (err) {
                    if(err.code === '23505' && type.toLowerCase() === 'user' && err.message.indexOf('address_lower_index') !== -1) {
                        var outcome = {
                            resourceType: "OperationOutcome",
                            issue: [{
                                "severity" : "error",
                                "code" : {
                                    "coding": [
                                      {
                                        "system": "http://hl7.org/fhir/issue-type",
                                        "code": "duplicate",
                                        "display": "Duplicate"
                                      }
                                    ],
                                    "text": "Duplicate"
                                },
                                "details" : { text: "Email address already exists!" }
                            }]
                        };
                        res.send(422, outcome);
                        return next(false);
                    }
                    console.error('error running query', err);
                    res.send(500);
                    return next();
                }
                if (result.command == "UPDATE" && result.rowCount == 0) {
                    res.send(404);
                    return next();
                }

                if (result.command == "INSERT") {
                    res.setHeader('location', baseUrl + type + '/' + result.rows[0].id);
                }
                res.send(successCode); 
            });
        }
    });
}

