var https = require('https');
var async = require('async');
var util = require('util');
var fs = require('fs');
var _ = require('underscore');

var logger = require('./logger.js');
var smime = require('./smime.js');
var config = require('./config.js');
var utils = require('./lib/utils.js');

var url = require('url');
var MailComposer = require('nodemailer/lib/mail-composer');

var xdrConnector = require('./lib/xdrConnector.js');
var xdrResponse = require('./lib/xdrResponse.js');
var mdnStorage = require('./mdnStorage.js');
var domainUtils = require('./lib/domainUtils.js');

//Local destinations
function initDestinations() {
    //add local domains
    var localDomains = domainUtils.getLocalDomains();
    _.each(localDomains, function(directDomain) {
        config.destinations['.*@' + directDomain] = {
            type: 'db'
        };
    });

    //setup regex
    for (var dest in config.destinations) {
        config.destinations[dest].regex = new RegExp(dest, 'i');
    }
}
initDestinations();

//REST server
var restServer = require('./rest/service.js');
restServer.init();

var smtpServer = require('./smtp/smtpServer.js');
smtpServer.init();

//==============================

var options = {
    requestCert: true,
    rejectUnauthorized: false,
    ca: [fs.readFileSync(config.cert)],
    key: fs.readFileSync(config.key),
    cert: fs.readFileSync(config.cert)
};

function processRequest(req, res) {
    var headers = req.headers;
    var body;
    var queryData = url.parse(req.url, true);
    // var params = queryData.query;
    var responseObject;
    var message;

    var handleResponse = function() {
        if (responseObject.headers) {
            res.writeHead(responseObject.statusCode, responseObject.statusMessage, responseObject.headers);
        } else {
            res.writeHead(responseObject.statusCode, responseObject.statusMessage);
        }
        if (responseObject.body) {
            logger.file('xdr_response.txt', responseObject.body);
            res.write(responseObject.body);
        }
        return res.end();
    };

    if (headers) {
        var ok = xdrConnector.validateHeaders(headers);
        if (!ok) {
            var err = new Error("InvalidRequestHeaders");
            logger.debug("Invalid headers for the XDR request: " + err.toString());
            responseObject = xdrResponse.create(err, null, queryData.pathname);
            return handleResponse();
        }
    }

    var fList = [
        function(cb) {
            utils.streamToString(req, function(err, str) {
                if (err) {
                    logger.error('Error while reading stream:' + err.toString());
                    return cb(err);
                }
                body = str;
                logger.file('xdr_message.txt', str);
                return  cb();
            });
        },
        function(cb) {
            xdrConnector.generateMessage(body, logger, function (err, msg) {
                if (err) {
                    return cb(err);
                }
                message = msg;
                logger.info('received message from: ' + message.from + ', to: ' + message.to[0]);
                return cb();
            });
        },
        function(cb) {
            if (message.notificationMessage) {
                if (message.mdn === "success") {
                    logger.debug("Received success notification: " + message.messageId);
                } else if (message.mdn === "failure") {
                    logger.error("Received failure notification: " + message.messageId);
                }
                return cb(null, message);
            }

            var fromUs = utils.mydestinations(message.from);
            var toUs = utils.mydestinations(message.to[0]);
            var dest = utils.getDestinationProperties(message.to[0]); // params
            var local = fromUs && toUs;

            if(!toUs && !fromUs) {
                logger.error('Fatal error, XDR relay attempt. Please check the authorized destinations list.');
                return cb(new Error('Relay denied'));
            }

            // if(local && dest.type === 'xdr') {
            //     xdrConnector.sendMessage(message, dest, logger, function (err1) {
            //         if (err1) {
            //             logger.error('Error while sending using XDR: ' + err1.toString());
            //             return cb(err1);
            //         }
            //         logger.info('Message delivered to XDR endpoint');
            //         return cb(null);
            //     });
            //     return;
            // }

            //XDR => Direct
            if (!toUs && fromUs && (!dest || dest.type === 'smtp')) {
                var msg = message.toSMTP(null, logger);
                var mail = new MailComposer(msg);
                var mail_string;
                var mail_string_encrypted;

                async.series([
                    function(cback) {
                        logger.info('Building SMTP message...');
                        mail.compile().build(function(err, m) {
                            if (err) {
                                logger.error('Error while building SMTP message: ' + err.toString());
                                return cback(err);
                            }
                            mail_string = m;
                            logger.info('Successfully built SMTP message.');
                            return cback();
                        });
                    },
                    function (cback) {
                        if (local) {
                            mail_string_encrypted = mail_string;
                            logger.debug('XDR local address to local address: not encrypting message.');
                            return cback();
                        }
                        logger.debug('Encrypting SMTP message...');
                        smime.encrypt(mail_string, message.from, message.to[0], logger, function(err, m) {
                            if(err) {
                                logger.error('Error while encrypting SMTP message: ' + err.toString());
                                return cback(err);
                            }
                            mail_string_encrypted = m;
                            logger.info('Successfully encrypted SMTP message.');
                            return cback();
                        });
                    },
                    function(cback) {
                        logger.debug('Sending using SMTP...');
                        var messageId = utils.generateSmtpMessageId(message.from);
                        mail_string_encrypted = 'Message-ID: ' + messageId + '\r\n' + mail_string_encrypted;
                        smtpServer.sendRawMail({
                            envelope: {
                                from: message.from,
                                to: message.to[0]
                            },
                            // text: "asdf"
                            raw: mail_string_encrypted
                        }, function (error, info) {
                            if (error) {
                                logger.error('Error while sending using SMTP:' + err.toString());
                                return cback(err);
                            }
                            logger.info('Successfully sent using SMTP ' +  JSON.stringify(info));
                            mdnStorage.saveNewOutgoingMessage(messageId, message.from, message.to[0], mail_string);
                            return cback();
                        });
                    }
                ], function(err) {
                    return cb(err);
                });
                return;
            }
            return cb(util.format('Transmission not supported (fromUs=%s, toUs=%s, dest type=%s)', fromUs, toUs, dest && dest.type || 'smtp'));
        }
    ];

    async.series(fList, function(err) {
        responseObject = xdrResponse.create(err, message, queryData.pathname);
        return handleResponse();
    });
}

var xdrServer = https.createServer(options, processRequest);
xdrServer.listen(config.xdrServer.port);
console.log('XDR server listening on port:', config.xdrServer.port);

xdrServer.on('error', function (err) {
    logger.debug('Error %s', err.message);
});
