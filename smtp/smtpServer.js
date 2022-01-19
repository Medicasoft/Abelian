var async = require('async');

var config = require('../config.js');
var logger = require('../logger.js');
var utils = require('../lib/utils.js');

var SMTPServer = require('smtp-server').SMTPServer;
var mdn = require('../lib/mdn.js');
var nm = require('nodemailer');
var smime = require('../smime.js');

var Message = require('../lib/message.js').Message;
var mimeParser = require('../lib/mimeParser.js');
var xdrDisposition = require('../lib/xdrDisposition.js');

var xdrConnector = require('../lib/xdrConnector.js');
var mdnStorage = require('../mdnStorage.js');
var messagePersister = require('../rest/messagePersister.js');
var mustSendDispatchedFilter = require('./mustSendDispatchedFilter.js');
var dispositionNotificationTransform = require('./dispositionNotificationTransform.js');

var smtp = nm.createTransport({
    host: config.smtpTargetServer.host,
    port: config.smtpTargetServer.port,
    secure: false,
    authOptional: true,
    tls: { rejectUnauthorized: false },
    ignoreTLS: true
});

var server;

function init() {
    server = new SMTPServer({
        secure: false,
        authOptional: true,
        tls: { rejectUnauthorized: false },
        ignoreTLS: true,
        onData: function (stream, session, callback) {
            var sessionLogger = logger.child(session.id);
            sessionLogger.error('START');
            console.log(JSON.stringify(session));
            processMessage(stream, session, sessionLogger, function(err) {
                if(err) {
                    sessionLogger.error('END WITH ERROR: ' + JSON.stringify(err));
                    callback(err);
                } else {
                    sessionLogger.debug('END');
                    callback();
                }
            });
        }
    });

    server.on('error', function (err) {
        console.error('Error %s', err.message);
    });

    server.listen(config.smtpLocalServer.port);
    console.log('SMTP server listening on port:', config.smtpLocalServer.port);
}

function processMessage(stream, session, logger, callback) {
    logger.info('received message from: ' + session.envelope.mailFrom.address + ', to: ' + session.envelope.rcptTo[0].address);
    //console.log(JSON.stringify(session));
    var fromUs = utils.mydestinations(session.envelope.mailFrom.address);
    var toUs = utils.mydestinations(session.envelope.rcptTo[0].address);
    var dest = utils.getDestinationProperties(session.envelope.rcptTo[0].address); // params
    logger.debug( 'Message destination. destType: ' + (dest && dest.type) + ', from us: ' + fromUs + ', to us: ' + toUs);

    if(!fromUs && !toUs) {
        return callback({
            responseCode: 551,
            message: '<' + session.envelope.rcptTo[0].address + '>: Relay access denied'
        });
    }
    var incomingMessage;
    var processedMessage;
    var parsedMessage;
    var mdnData;
    var isDispatchedMdnRequested;
    var timelyReceivedDispatchedMdn;
    var local = fromUs && toUs;


    var fList = [
        function(cb) {
            utils.streamToString(stream, function(err, str) {
                if (err) {
                    logger.error('Error while reading stream:' + err.toString());
                    return cb(err);
                }
                incomingMessage = str;
                logger.file('incomingMessage_', incomingMessage);
                return  cb();
            });
        },
        function(cb) {
            if (local) {
                mimeParser.parse(incomingMessage, { checkMdn: true, shalowParse: true }, logger, function(err, parsedMessage2, mdnData2, isDispatchedMdnRequested2) {
                    if(err) {
                        logger.error('Error while parsing actual message content attachment: ' + err.toString());
                        return cb(err);
                    }
                    parsedMessage = parsedMessage2;
                    mdnData = mdnData2;
                    if(mdnData) {
                        logger.debug('Message is a ' + mdnData.type + ' MDN!');
                    } else {
                        isDispatchedMdnRequested = isDispatchedMdnRequested2;
                        logger.debug('Dispatched MDN requested: ' + isDispatchedMdnRequested);
                    }

                    logger.file('parsedMessage_', JSON.stringify(parsedMessage, null, 4));

                    if(!mdnData && !parsedMessage.headers['disposition-notification-to']) {
                        incomingMessage = dispositionNotificationTransform.doTransform(incomingMessage, session.envelope.mailFrom.address, logger);
                        logger.file('incomingMessage_disposition_', incomingMessage);
                    }

                    processedMessage = incomingMessage;
                    return cb(null);
                });
            } else if (fromUs) {
                mimeParser.parse(incomingMessage, { checkMdn: true, shalowParse: true }, logger, function(err, parsedMessage2, mdnData2) {
                    if(err) {
                        logger.error('Error while parsing message (fromUs): ' + err.toString());
                        return cb(err);
                    }
                    parsedMessage = parsedMessage2;
                    mdnData = mdnData2;
                    if(mdnData) {
                        logger.debug('Message is a ' + mdnData.type + ' MDN!');
                    }

                    logger.file('parsedMessage_', JSON.stringify(parsedMessage, null, 4));

                    if(!mdnData && !parsedMessage.headers['disposition-notification-to']) {
                        incomingMessage = dispositionNotificationTransform.doTransform(incomingMessage, session.envelope.mailFrom.address, logger);
                        logger.file('incomingMessage_disposition_', incomingMessage);
                    }

                    smime.encrypt(incomingMessage, session.envelope.mailFrom.address, session.envelope.rcptTo[0].address, logger, function (err, result) {
                        if (err) {
                            logger.error('Encryption error:' + err.toString());
                            return cb(err);
                        }
                        processedMessage = result;
                        return cb();
                    });
                });
            } else if (toUs) {
                smime.decrypt(incomingMessage, session.envelope.mailFrom.address, session.envelope.rcptTo[0].address, logger, function (err, result) {
                    if (err) {
                        logger.error('Decryption error:' + err.toString());
                        return cb({ responseCode: 250 }); // do not throw error
                    }
                    processedMessage = result.decryptedMessage;
                    parsedMessage = result.parsedMessage;
                    mdnData = result.mdnData;
                    isDispatchedMdnRequested = result.isDispatchedMdnRequested;
                    return cb();
                });
            }
        },
        function(cb) {
            //TODO review this - prevent the delivery of processed MDN to local interface
            // if(toUs && mdnData && mdnData.type === mdn.MDN_DISPOSITION_PROCESSED) {
            //     logger.debug('Not delivering processed MDN to local interface');
            //     return cb(); //do not deliver processed MDN to local interface
            // }

            if (!dest || dest.type === 'smtp') {
                logger.debug('Sending using SMTP...');
                var messageId = utils.generateSmtpMessageId(session.envelope.mailFrom.address);
                processedMessage = 'Message-ID: ' + messageId + '\r\n' + processedMessage;
                smtp.sendMail({
                    envelope: {
                        from: session.envelope.mailFrom.address,
                        to: session.envelope.rcptTo[0].address
                    },
                    raw: processedMessage
                }, function (err, info) {
                    if (err) {
                        logger.error('Error while sending using SMTP:' + err.toString());
                        return cb(err);
                    }
                    logger.info('Successfully sent using SMTP ' +  JSON.stringify(info));
                    if(!mdnData && !toUs) {
                        mdnStorage.saveNewOutgoingMessage(messageId, session.envelope.mailFrom.address, session.envelope.rcptTo[0].address, incomingMessage);
                    }
                    return cb();
                });
            } else if (dest.type === 'db'){ //db
                logger.info('Delivering message to local message database');
                //TODO transmit queue_id from mail queue (as in the old Abelian implementation)
                messagePersister.save(session.envelope.rcptTo[0].address, session.envelope.mailFrom.address, incomingMessage, processedMessage, logger, cb);
            } else { //xdr
                if(mdnData) { //do not simply forward MDN for XDR endpoints
                    return cb();
                }
                logger.debug('Sending using XDR...');
                var message = new Message();
                message.buildFromSMTP(processedMessage, logger, function (err) {
                    if (err) {
                        logger.error('Error while building message from SMTP: ' + err.toString());
                        return cb(err);
                    }
                    xdrConnector.sendMessage(message, dest, logger, function (err1) {
                        if (err1) {
                            logger.error('Error while sending message using XDR: ' + err1.toString());
                            return cb(err1);
                        }
                        logger.info('Message delivered to XDR endpoint');
                        return cb();
                    });
                });
            }
        },
        //send dispatched MDN
        function(cb) {
            //do not send dispatched MDN when delivering to local 'db' endpoints; 'db' endpoints will send (through direct-worker) the dispatched/failed MDN
            if(!toUs || mdnData || (dest && dest.type === 'db' && !mustSendDispatchedFilter.check(session.envelope.rcptTo[0].address))) {
                return cb(null);
            }

            if(!isDispatchedMdnRequested) {
                return cb(null);
            }

            var mdnSender = session.envelope.rcptTo[0].address;
            var mdnRecipient = session.envelope.mailFrom.address;
            var originalMesageId = parsedMessage.headers['message-id'];

            smime.sendMdn(mdnSender, mdnRecipient, originalMesageId, parsedMessage.subject, mdn.MDN_DISPOSITION_DISPATCHED, logger, function(err) {
                if (err) {
                    logger.error('Error while preparing and sending dispatched MDN:' + err.toString());
                }
                return cb(null); //TODO review this - now hiding error occurred while building the MDN
            });
        },
        function(cb) { //on receiving MDN, move original message to corresponding folder
            if(!toUs || !mdnData) {
                logger.debug('move message: false (toUs = ' + toUs +', mdn: ' + !!mdnData + ')');
                return cb(null);
            }
            mdnStorage.moveMessage(mdnData.originalMessageId, session.envelope.rcptTo[0].address, session.envelope.mailFrom.address, mdnData.type, function(err) {
                if(err) {
                    logger.error('Move message error: ' + err.toString());
                    return cb(null);
                }
                logger.debug('move message: end');

                timelyReceivedDispatchedMdn = true;
                cb(null);
            });
        },
        function(cb) {
            if(!timelyReceivedDispatchedMdn || !mdnData || mdnData.type === mdn.MDN_DISPOSITION_PROCESSED || !dest || dest.type !== 'xdr') {
                return cb(null);
            }

            var dispType;
            if(mdnData.type === mdn.MDN_DISPOSITION_FAILED) {
                dispType = 'failure';
            } else if(mdnData.type === mdn.MDN_DISPOSITION_DISPATCHED) {
                dispType = 'success';
            } else {
                logger.error('Unsupported MDN type: ' + mdnData.type);
                return cb(null);
            }

            logger.debug('Sending XDR disposition notification: ' + dispType);

            var dnTo = session.envelope.rcptTo[0].address;
            var originalRecipient = session.envelope.mailFrom.address;

            var message = xdrDisposition.createMessageDisposition(dispType, dnTo, originalRecipient, mdnData.originalMessageId);
            xdrConnector.sendMessage(message, dest, logger, function (err1) {
                if (err1) {
                    logger.error('Error while sending disposition notification using XDR: ' + err1.toString());
                    return cb(err1);
                }
                logger.info('Disposition notification delivered to XDR endpoint');
                return cb();
            });
        }
    ];
    async.series(fList, function(err) {
        if (err) {
            if (err.responseCode) {
                return callback({ responseCode: err.responseCode, message: err.message });
            }
            return callback({ responseCode: 554, message: err.message || 'Transaction failed' });
        }

        return callback();
    });
}

module.exports.init = init;
module.exports.processMessage = processMessage;
module.exports.sendRawMail = smtp.sendMail;