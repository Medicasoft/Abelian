var restify = require('restify'),
    pg = require('pg'),
    config = require('./config.js');

var connString = config.connString;
var baseUrl = config.baseUrl;

var resources = {
    user: {
        queries: {
            list: 'SELECT * FROM users;',
            get: 'SELECT * FROM users WHERE id=$1;',
            create: 'INSERT INTO users(address, certificate) VALUES ($1, $2) RETURNING id',
            update: 'UPDATE users SET address=$2, certificate=$3 WHERE id=$1;',
            delete: 'DELETE FROM users WHERE id = $1;'
        },
        toJson: userToJson
    },
    domain: {
        queries: {
            list: 'SELECT * FROM domains;',
            get: 'SELECT * FROM domains WHERE id=$1;',
            create: 'INSERT INTO domains(name, anchor_path, crl_path, crypt_cert, cert_disco_algo) VALUES ($1, $2, $3, $4, $5) RETURNING id;',
            update: 'UPDATE domains SET name=$2, anchor_path=$3, crl_path=$4, crypt_cert=$5, cert_disco_algo=$6 WHERE id=$1;',
            delete: 'DELETE FROM domains WHERE id = $1;'
        },
        toJson: domainToJson
    }
}

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
    server.put('/Domain/:id', restify.bodyParser(), updateDomain);
    server.del('/Domain/:id', deleteDomain);
} 

//user routes
function getUsers(req, res, next) {
    getEntities(req, res, next, 'User');
}
function getUser(req, res, next) {
    getEntity(req, res, next, 'User');
}
function createUser (req, res, next) {
    executeSql(req, res, next, 'User', 'create',  [req.body.address, req.body.certificate], 201);
}
function updateUser (req, res, next) {
    executeSql(req, res, next, 'User', 'update', [req.params.id, req.body.address, req.body.certificate], 200);
}
function deleteUser (req, res, next) {
    executeSql(req, res, next, 'User', 'delete', [req.params.id], 204);
}
    

function userToJson(row) {
    return {
        id: baseUrl + 'User/' + row.id,
        content: {
            address: row.address,
            certificate: row.certificate
        }
    };
}

//domain routes
function getDomains (req, res, next) {
    getEntities(req, res, next, 'Domain');
}
function getDomain (req, res, next) {
    getEntity(req, res, next, 'Domain');
}
function createDomain (req, res, next) {
    executeSql(req, res, next, 'Domain', 'create',
        [req.body.name, req.body.anchor_path, req.body.crl_path, req.body.crypt_cert, req.body.cert_disco_algo], 201);
}
function updateDomain (req, res, next) {
    executeSql(req, res, next, 'Domain', 'update',
        [req.params.id, req.body.name, req.body.anchor_path, req.body.crl_path, req.body.crypt_cert, req.body.cert_disco_algo], 200);
}
function deleteDomain(req, res, next) {
    executeSql(req, res, next, 'Domain', 'delete', [req.params.id], 204);
}


function domainToJson(row) {
    return {
        id: baseUrl + 'Domain/' + row.id,
        content: {
            name: row.name,
            anchor_path: row.anchor_path,
            crl_path: row.crl_path,
            crypt_cert: row.crypt_cert,
            cert_disco_algo: row.cert_disco_algo
        }
    };
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
                    entities.entry.push({
                        id: baseUrl +  type + '/' + entity.id,
                        content: entity.content
                    });
                }
                res.send(200, entities);
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

