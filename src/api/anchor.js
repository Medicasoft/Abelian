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
	cp = require('child_process'),
	config = require('./config.js'),
	resources = require('./resources');

var connString = config.connString;
var baseUrl = config.baseUrl;

module.exports = {
	registerRoutes : registerRoutes
};


// anchor routes
function registerRoutes(server) {
	server.post('/Anchor', restify.bodyParser(), createAnchor);
	server.del('/Anchor/:id', deleteAnchor);
	server.get('/Anchors', getAnchors);
	server.get('/Anchor/:id', getAnchor);
	server.put('/Anchor/:id', restify.bodyParser(), updateAnchor);
}

function createAnchor(req, res, next) {
    if (req.body.local_domain_name === undefined) {
        res.send(400, 'local_domain_name is mandatory');
        return next();
    }
    if (req.body.cert === undefined) {
        res.send(400, 'cert is mandatory');
        return next();
    }

    //when both local_doman and domain are specified, check if anchor exists => update it, else => add it
    if (req.body.domain_name !== undefined) {
        findByLocalDomainAndDomain(req.body.local_domain_name, req.body.domain_name, function (err, anchor) {
            if (err) {
                console.error('Error when searching for anchors: ', err);
                res.send(500);
                return next();
            }
            if (anchor == null)
                doCreateAnchor(req, res, next);
            else {//exists               
                doUpdateAnchor(req, res, next);
            }
        });
    }
    else {
        findByLocalDomainAndCert(req.body.local_domain_name, req.body.cert, function (err, anchor) {
            if (err) {
                console.error('Error when searching for anchors: ', err);
                res.send(500);
                return next();
            }
            if (anchor == null)
                doCreateAnchor(req, res, next);
            else {//exists               
                res.send(200);
                return next();
            }
        });
    }
}

function doCreateAnchor(req, res, next) {
    var child = cp.exec('/var/spool/direct/tools/direct_anchor -d ' + req.body.local_domain_name + ' add', function (err, stdout, stderr) {
        if (stderr !== '') {
            console.error('direct_anchor stderr: ' + stderr);
            res.send(500, stderr);
            return next();
        }
        executeSql(req, res, next, 'Anchor', 'create',
                [req.body.local_domain_name, req.body.domain_name, req.body.cert], 201);
        return next();
    });
    child.stdin.write(req.body.cert);
    child.stdin.end();
    return next();
}
function findByLocalDomainAndDomain(local_domain, domain, callback) {    
    var find_qry = resources['anchor'].queries.findByLocalDomainAndDomain;
    findAnchors(find_qry, [local_domain, domain], callback);
}

function findByLocalDomainAndCert(local_domain, cert, callback) {
    var find_qry = resources['anchor'].queries.findByLocalDomainAndCert;
    findAnchors(find_qry, [local_domain, cert], callback);
}

function findAnchors(find_qry, args,  callback) {
    pg.connect(connString, function (err, client, done) {
        if (err) {
            callback(err);
            return;
        } else {
            client.query(find_qry, args, function (err, result) {
                done();
                if (err) {
                    callback(err);
                    return;
                }
                if (result.rowCount == 0) {
                    callback(null, null);
                }
                else
                    callback(null, result.rows[0]);
            });
        }
    });
}




function deleteAnchor (req, res, next) {
    var entityToJson = resources['anchor'].toJson;
    var get_qry = resources['anchor'].queries['get'];
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
		
		        var child = cp.exec('/var/spool/direct/tools/direct_anchor -d ' + entity.content.local_domain_name + ' remove', function(err, stdout, stderr) {
        	        if (stderr !== '') {
                	    console.error('direct_anchor stderr: ' + stderr);
				    res.send(500, stderr);
				    return next();
			    }
			    executeSql(req, res, next, 'Anchor', 'delete', [req.params.id], 204);
	                    return next();
	            });
	            child.stdin.write(entity.content.cert);
	            child.stdin.end();
	            return next();
	         });
        }
    });        
}

function updateAnchor(req, res, next) {
    var get_qry = resources[type.toLowerCase()].queries['get'];

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

                doUpdateAnchor(req, res, next);
            });
        }
    });
}

function doUpdateAnchor(req, res, next) {
    var child = cp.exec('/var/spool/direct/tools/direct_anchor -d ' + req.body.local_domain_name + ' add', function (err, stdout, stderr) {
        if (stderr !== '') {
            console.error('direct_anchor stderr: ' + stderr);
            res.send(500, stderr);
            return next();
        }
        executeSql(req, res, next, 'Anchor', 'update',
            [req.params.id, req.body.local_domain_name, req.body.domain_name, req.body.cert], 200);
        return next();
    });
    child.stdin.write(req.body.cert);
    child.stdin.end();
    return next();
}

function getAnchors (req, res, next) {
    resources.getEntities(req, res, next, 'Anchor');
}
function getAnchor (req, res, next) {
    getEntity(req, res, next, 'Anchor');
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

