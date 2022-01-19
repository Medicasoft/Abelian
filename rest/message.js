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
    smtpServer = require('../smtp/smtpServer.js'),
    config = require('../config.js').rest,
    async = require("async"),
    logger = require("../logger.js"),
    db = require('./db.js'),
    resources = require('./resources.js');

var get_message_qry = 'SELECT * FROM messages WHERE id = ?;';
var del_message_qry = 'DELETE FROM messages WHERE id = ?;';


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

    db.query(get_message_qry, [req.params.id], function (err, result) {
        if (err) {
            logger.error(err, 'error running query');
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
        log : logger,
        message_domains : req.params.domain.split(','),
        size : req.params._count,
        lock : req.query.lock === 'true' || req.query.lock === true
    };

    var afterFn = function(err, response) {
        if(err) {
            logger.error(err, 'error running query');
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
        beginTransaction,
        queryNextMessages,
        commitTransaction
    ], function(err, data) {
        callback(err, data.entities);
    });
}


function beginTransaction(data, callback) {
    // logger.debug('Begin transaction');
    db.query('BEGIN', function(err, result) {
        if(err) {
            logger.debug('Error beginning transaction');
            return callback(err, data);
        }
        return callback(null, data);
    });
}

var queryNextMessages = function(data, callback) {
    var size = (data.size !== undefined ? data.size : config.pageSize) || 0;

    var entities = {
        entry: []
    };

    async.each(data.message_domains, function(message_domain, cb) {
        var meta = resources.message;
        db.query(meta.queries.get_and_lock_next_messages, [ parseInt(size), message_domain, data.lock ], function (err, result) {
            if (err) {
                return callback(err, data);
            }

            //the result of a stored procedure, extract first rowset:
            var rows = result.rows[0];

            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                var entity = meta.toJson(row)
                entities.entry.push({
                    id: entity.id,
                    content: entity.content
                });
            }

            cb(null);
        });
    }, function(err) {
        if(err) {
            callback(err);
        }
        entities.totalResults = entities.entry.length;
        data.entities = entities;
        callback(null, data);
    });
};

function commitTransaction(data, callback) {
    // logger.debug('Commit transaction');
    db.query('COMMIT', function(err, result) {
        if(err) {
            logger.error('Error commiting transaction');
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
    ], function(err) {
        if(!err) {
            logger.debug('successfully sent a message');
            res.send(200);
            return next();
        }
        logger.error('Error when sending message: ' + err.message);

        if(err.code === 'MAIL_HEADERS') {
            res.send(400, 'Mail headers missing');
            return next();
        }

        res.send(422, err.message);
        return next();

        // res.send(500, err);
    });
}


function saveMessage(req, callback) {
    var str = req.body.toString();

    var info = readFromTo(str);
    if(!info) {
        var err = new Error('Could not read sender and recipient from message');
        err.code = 'MAIL_HEADERS';
        return callback(err);
    }

    var session = {
        envelope: {
            mailFrom: {
                address: info.from
            },
            rcptTo: [{
                address: info.to
            }]
        }
    };

    var Readable = require('stream').Readable;
    var s = new Readable();
    s.push(req.body);
    s.push(null);      // indicates end-of-file basically - the end of the stream

    var sessionLogger = logger.child(req.id());
    smtpServer.processMessage(s, session, sessionLogger, function(err) {
        if(!err) {
            return callback(null);
        }
        err.code = 'PROCESS_MSG';
        callback(err);
    });
}

function matchHeader(name, str) {
    var matches = str.match(new RegExp("(?:^|\n)\s*" + name + ":\s*(.*)\r?\n", "i"));
    if(matches && matches.length === 2) {
        return matches[1].trim().replace(/^<|>$/g,''); //remove starting '<' or trailing '>'
    }
}

function readFromTo(str) {
    return {
        from: matchHeader("From", str),
        to: matchHeader("To", str)
    };
}

function deleteMessage(req, res, next) {

    db.query(del_message_qry, [req.params.id], function (err, result) {
        if (err) {
            logger.error(err, 'error running query');
            res.send(500);
            return next();
        }

        res.send(204); //no content
    });
}

