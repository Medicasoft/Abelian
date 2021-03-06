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
    async = require("async"),
    util = require("util"),
    resources = require('./resources.js');

var connString = config.connString;
var get_message_qry = 'SELECT * FROM messages WHERE id = $1;';
var del_message_qry = 'DELETE FROM messages WHERE id = $1;';


module.exports = {
    registerRoutes : registerRoutes
};

function registerRoutes(server) {
    server.get('/Message/:id', getMessage);
    server.get('/Messages', getMessages);
    server.post('/Messages', getNextMessages);
    server.post('/Message', restify.bodyParser(), sendMessage);
    server.del('/Message/:id', deleteMessage);
}


function getMessage(req, res, next) {
    if(req.query.type && ['msg', 'original'].indexOf(req.query.type) === -1) {
        res.send(400, 'Type parameter expects a value from list: msg, original.');
        return next(false);
    }
    pg.connect(connString, function(err, client, done) {
        if(err) {
            console.error('error fetching client from pool', err);
            res.send(500);
            return next();
        } else {
            client.query(get_message_qry, [req.params.id], function (err, result) {
                done();
                if (err) {
                    console.error('error running query', err);
                    res.send(500);
                    return next();
                }
                if (result.rowCount === 0) {
                    res.send(404);
                    return next();
                }

                var msg;
                if(req.query.type && req.query.type === 'original') {
                    msg = result.rows[0].original;
                } else {
                    msg = result.rows[0].msg;
                }
                res.header('Content-Type', 'application/mime');
                res.send(200, msg);
            });
        }
    });
}

function getMessages(req, res, next) {
    if(req.params.lock !== undefined) {
        res.send(400, 'Unexpected parameter "lock"');
        return next(false);
    }

    resources.getEntities(req, res, next, 'Message');
}

function getNextMessages(req, res, next) {
    if(req.params.lock === undefined || req.params.domain === undefined || req.params._count === undefined) {
        res.send(400, 'Mandatory parameters: lock, domain, _count');
        return next(false);
    }

    //get and lock next messages to process
    var options = {
        log : req.log,
        message_domains : req.params.domain.split(','),
        size : req.params._count,
        lock : req.query.lock === 'true' || req.query.lock === true,
		connString : connString
    };

    var afterFn = function(err, response) {
        if(err) {
            console.error('error running query', err);
            res.send(500);
            return next(false);
        }

        res.send(200, response);
        next();
    };

    getNextMessagesDb(options, afterFn);
}

function getNextMessagesDb(options, callback) {
    async.waterfall([
        function(cb) {
            cb(null, options);
        },
        connect,
        beginTransaction,
        queryNextMessages,
        commitTransaction
    ], function(err, data) {
        callback(err, data.entities);
    });
}


function connect(data, callback) {
    pg.connect(data.connString, function(err, client, done) {
        data.client = client;
        data.done = done;
        if(err) {
            callback(err);
        } else {
            callback(null, data);
        }
    });
}

function beginTransaction(data, callback) {
    // console.log('Begin transaction');
    data.client.query('BEGIN', function(err, result) {
        if(err) {
            console.log('Error beginning transaction');
            return callback(err, data);
        }
        return callback(null, data);
    });
}

var queryNextMessages = function(data, callback) {
    var size = (data.size !== undefined ? data.size : config.pageSize) || 0;
    var message_domains = util.format('{%s}', data.message_domains.join(','));

    var meta = resources.message;
    data.client.query(meta.queries.get_and_lock_next_messages, [ size, message_domains, data.lock ], function (err, result) {
        data.done();
        if (err) {
            return callback(err, data);
        }

        var entities = {
            totalResults : result.rows.length,
            entry: []
        };

        for (var i = 0; i < result.rows.length; i++) {
            var str = result.rows[i].get_and_lock_next_messages;
            var row = str.substring(1, str.length - 1).split(','); //remove parantheses and split by comma
            var entity = {
                id : row[0],
                content : {
                    to : row[1],
                    sender : row[2],
                    guid : row[3]
                }
            };
            entities.entry.push({
                id: entity.id,
                content: entity.content
            });
        }

        data.entities = entities;
        callback(null, data);
    });
};

function commitTransaction(data, callback) {
    // console.log('Commit transaction');
    data.client.query('COMMIT', function(err, result) {
        if(err) {
            console.error('Error commiting transaction');
            return callback(err, data);
        }
        callback(null, data);
    });
}


function sendMessage(req, res, next) {
    if(req.body === undefined) {
        res.send(400, 'Invalid content-type');
        return next();
    }
    async.waterfall([
        function(callback) {
            callback(null, req);
        },
        saveMessage
    ], function(err, result) {
        if(err === null) {
            console.log('smimesend.py successfully sent a message');
            res.send(200);
            return;
        }
        console.error('smimesend.py error:' + err);

        if(err.code === 2) {
            res.send(400, 'Mail headers missing');
            return;
        }
        if(err.code === 1) {
            res.send(422, err.message);
            return;
        }

        res.send(500, err);
    });
}


var list_tag = '[smime_errors] ';

function saveMessage(req, callback) {
    var child = cp.exec('./smimesend.py', {cwd: '/var/spool/direct/' }, function(err, stdout, stderr) {
    if(err) {
        var i = stderr.lastIndexOf(list_tag) + list_tag.length;
        var relevantErrMsg;
        if(i === -1) {
        relevantErrMsg = 'Unknown error on sending DIRECT mail';
        }
        else {
            var j = stderr.indexOf('\n', i);
            relevantErrMsg = j !== -1 ? stderr.substring(i, j) : stderr.substring(i);
        }
            err.message = relevantErrMsg;
    }

    callback(err);
    });
    child.stdin.write(req.body);
    child.stdin.end();
}


function deleteMessage(req, res, next) {
    pg.connect(connString, function(err, client, done) {
        if(err) {
            console.error('error fetching client from pool', err);
            res.send(500);
            return next();
        } else {
            client.query(del_message_qry, [req.params.id], function (err, result) {
                done();
                if (err) {
                    console.error('error running query', err);
                    res.send(500);
                    return next();
                }

                res.send(204); //no content
            });
        }
    });
}

