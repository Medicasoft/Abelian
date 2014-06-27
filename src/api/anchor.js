var restify = require('restify'),
	pg = require('pg'),
	cp = require('child_process'),
	config = require('./config.js');

var connString = config.connString;
var baseUrl = config.baseUrl;

module.exports = {
	registerRoutes : registerRoutes
};

function registerRoutes(server) {
	server.post('/Anchor', restify.bodyParser(), createAnchor);
	server.del('/Anchor/:id', deleteAnchor);
	server.get('/Anchors', getAnchors);
	server.get('/Anchor/:id', getAnchor);
	server.put('/Anchor/:id', restify.bodyParser(), updateAnchor);
}

var resources = {
    anchor: {
        queries: {
            list: 'SELECT * FROM anchors;',
            get: 'SELECT * FROM anchors WHERE id=$1;',
            create: 'INSERT INTO anchors(local_domain_name, domain_name, cert) VALUES ($1, $2, $3) RETURNING id;',
            update: 'UPDATE anchors SET local_domain_name=$2, domain_name=$3, cert=$4 WHERE id=$1;',
            delete: 'DELETE FROM anchors WHERE id = $1;'
        },
        toJson: anchorToJson
    }
}

// anchor routes

function createAnchor (req, res, next) {

	var child = cp.exec('/var/spool/direct/tools/direct_anchor -d ' + req.body.local_domain_name + ' add', function(err, stdout, stderr) {
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
		
		var child = cp.exec('/var/spool/direct/tools/direct_anchor -d ' + entity.local_domain_name + ' remove', function(err, stdout, stderr) {
        	        if (stderr !== '') {
                	        console.error('direct_anchor stderr: ' + stderr);
				res.send(500, stderr);
				return next();
			}
			executeSql(req, res, next, 'Anchor', 'delete', [req.params.id], 204);
	                return next();
	        });
	        child.stdin.write(entity.cert);
	        child.stdin.end();
	        return next();
	     });
        }
    });
        
}

function updateAnchor (req, res, next) {
	var child = cp.exec('/var/spool/direct/tools/direct_anchor -d ' + req.body.local_domain_name + ' add', function(err, stdout, stderr) {
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
    getEntities(req, res, next, 'Anchor');
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
		delete entity.id;
                res.send(200, entity);
            });
        }
    });
}

function anchorToJson(row) {
    return {
        id: baseUrl + 'Anchor/' + row.id,
        local_domain_name: row.local_domain_name,
        domain_name: row.domain_name,
        cert: row.cert
        }
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

function getEntities(req, res, next, type) {
    var get_qry = resources[type.toLowerCase()].queries['list'];
    var entityToJson = resources[type.toLowerCase()].toJson;

    pg.connect(connString, function (err, client, done) {
        if (err) {
            console.error('error fetching client from pool', err);
            res.send(500);
            return next();
        } else {
            client.query(get_qry, function (err, result) {
                done();
                if (err) {
                    console.error('error running query', err);
                    res.send(500);
                    return next();
                }

                var totalResults = result.rows.length;
                var entities = {
                    totalResults: totalResults,
                    entry: []
                };

                for (var i = 0; i < totalResults; i++) {
                    var row = result.rows[i];
                    var entity = entityToJson(row);
                    var idd = entity.id;
		    delete entity.id;
		    entities.entry.push({
                        id: idd,
                        content: entity
                    });
                }
                res.send(200, entities);
            });
        }
    });
}
