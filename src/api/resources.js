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

var util = require('util'),
    pg = require('pg'),
    async = require('async'),
    config = require('./config');

var connString = config.connString;
var port = config.port;
var baseUrl = config.baseUrl;


var resources = {
    getEntities: getEntities,

    user: {
        queries: {
            list: 'SELECT * FROM users %s LIMIT $1 OFFSET $2;',
            get: 'SELECT * FROM users WHERE id=$1;',
            create: 'INSERT INTO users(address, certificate) VALUES ($1, $2) RETURNING id',
            update: 'UPDATE users SET address=$2, certificate=$3 WHERE id=$1;',
            delete: 'DELETE FROM users WHERE id = $1;',
            count: 'SELECT count(*) from users %s;'
        },
        search: {
            userName: "userName like '%s%'",
            domain: "domain = '%s'"
        },
        toJson: userToJson,
        urlSearchFragment: "Users"
    },
    domain: {
        queries: {
            list: 'SELECT * FROM domains %s LIMIT $1 OFFSET $2;',
            get: 'SELECT * FROM domains WHERE id=$1;',
            count: 'SELECT count(*) from domains %s;'
            //           create: 'INSERT INTO domains(name, anchor_path, crl_path, crypt_cert, cert_disco_algo) VALUES ($1, $2, $3, $4, $5) RETURNING id;',
            //           update: 'UPDATE domains SET name=$2, anchor_path=$3, crl_path=$4, crypt_cert=$5, cert_disco_algo=$6 WHERE id=$1;',
            //           delete: 'DELETE FROM domains WHERE id = $1;'
        },
        toJson: domainToJson,
        urlSearchFragment: "Domains"
    },
    message: {
        queries: {
            list: 'SELECT * FROM messages %s LIMIT $1 OFFSET $2;',
            count: 'SELECT count(*) from messages %s;'
        },
        toJson: messageToJson,
        urlSearchFragment: "Messages"
    },
    anchor: {
        queries: {
            list: 'SELECT * FROM anchors %s LIMIT $1 OFFSET $2;',
            get: 'SELECT * FROM anchors WHERE id=$1;',
            create: 'INSERT INTO anchors(local_domain_name, domain_name, cert) VALUES ($1, $2, $3) RETURNING id;',
            update: 'UPDATE anchors SET local_domain_name=$2, domain_name=$3, cert=$4 WHERE id=$1;',
            delete: 'DELETE FROM anchors WHERE id = $1;',
            count: 'SELECT count(*) from anchors %s;',
            findByLocalDomainAndDomain: "SELECT * FROM anchors where local_domain_name=$1 and domain_name=$2 limit 1;",
            findByLocalDomainAndCert: "SELECT * FROM anchors where local_domain_name=$1 and cert=$2 limit 1;",
        },
        toJson: anchorToJson,
        urlSearchFragment: "Anchors"
    }
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

function domainToJson(row) {
    return {
        id: baseUrl + 'Domain/' + row.id,
        content: {
            name: row.name,
            anchor_path: row.anchor_path,
            crl_path: row.crl_path,
            crypt_cert: row.crypt_cert,
            cert_disco_algo: row.cert_disco_algo,
            is_local: row.is_local
        }
    };
}

function messageToJson(row) {
    return {
        id: baseUrl + 'Message/' + row.id,
        content: {
            to: row.recipient,
            sender: row.sender
        }
    };
}

function anchorToJson(row) {
    return {
        id: baseUrl + 'Anchor/' + row.id,
        content: {
            local_domain_name: row.local_domain_name,
            domain_name: row.domain_name,
            cert: row.cert
        }
    }
}


function getEntities(req, res, next, type) {
    var meta = resources[type.toLowerCase()];
    var page = req.query.page === undefined ? 1 : new Number(req.query.page);
    if (isNaN(page) || page <= 0) {
        res.send(400, "Parameter 'page' expects a number greater than 0");
        return next();
    }
    var where = '';
    if (meta.search) {
        var isFirst = true;
        for (var elem in req.query) {
            if (meta.search[elem] !== undefined) {
                if (!isFirst)
                    where += ' and ';
                else
                    isFirst = false;
                if (typeof req.query[elem] === 'string' && req.query[elem].indexOf(',') >= 0) {
                    var parts = req.query[elem].split(',');
                    where += '(';
                    for (var i =0; i < parts.length; i += 1) {
                        if (i> 0) {
                            where += ' or ';
                        }
                        where += util.format(meta.search[elem], parts[i]);
                    }
                    where += ')';
                } else {
                where += util.format(meta.search[elem], req.query[elem]);
                }
            }
        }
    }
    if (where) where = 'WHERE ' + where;

    pg.connect(connString, function (err, client, done) {
        if (err) {
            console.error('error fetching client from pool', err);
            res.send(500);
            return next();
        }

        async.waterfall([
            //count
            function (cb) {
                var count_qry = meta.queries['count'];
                count_qry = util.format(count_qry, where ? where : '');
                client.query(count_qry, function (err, result) {
                    done();
                    if (err) {
                        cb(new Error('error running query - ' + err));
                    }
                    else
                        cb(null, new Number(result.rows[0].count));
                });
            },
            //get paged result
            function (totalResults, cb) {
                var get_qry = meta.queries['list'];
                var limit = 'ALL';
                var offset = 0;

                if (config.pageSize) {
                    limit = config.pageSize;
                    if (page) {
                        offset = (page - 1) * config.pageSize;
                    }
                }
                if (offset && offset >= totalResults) {
                    res.send(404);
                    cb(null);
                    return;
                }

                var entities = {
                    totalResults: totalResults,
                    link: [],
                    entry: []
                };

                if (totalResults == 0) {
                    delete entities.link;
                    res.send(200, entities);
                    cb(null);
                    return;
                }

                var entityToJson = meta.toJson;
                get_qry = util.format(get_qry, where ? where : '');
                client.query(get_qry, [limit, offset], function (err, result) {
                    done();
                    if (err) {
                        cb(err);
                        return;
                    }

                    var searchUrl = baseUrl + meta.urlSearchFragment;
                    var currentPage = page ? page : 1;
                    var nextPage = totalResults > offset + limit ? currentPage + 1 : undefined;
                    var prevPage = offset > 0 ? currentPage - 1 : undefined;

                    entities.link.push({ rel: "self", href: searchUrl + "?page=" + currentPage });

                    if (prevPage)
                        entities.link.push({ rel: "previous", href: searchUrl + "?page=" + prevPage });

                    if (nextPage)
                        entities.link.push({ rel: "next", href: searchUrl + "?page=" + nextPage });

                    for (var i = 0; i < result.rows.length; i++) {
                        var row = result.rows[i];
                        var entity = entityToJson(row);
                        entities.entry.push({
                            id: entity.id,
                            content: entity.content
                        });
                    }
                    res.send(200, entities);
                    cb(null);
                });
            }],
            //callback
            function (err) {
                if (err) {
                    console.error(err);
                    res.send(500);
                }
                return next();
            });
    });

}



module.exports = resources;