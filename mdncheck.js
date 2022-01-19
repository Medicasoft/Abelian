var fs = require('fs');
var path = require('path');
var async = require('async');
var nm = require('nodemailer');
var config = require('./config.js');
var MailComposer = require('nodemailer/lib/mail-composer');
var xdrDisposition = require('./lib/xdrDisposition.js');
var logger = require('./logger.js');
var utils = require('./lib/utils.js');
var xdrConnector = require('./lib/xdrConnector.js');

var timeout = config.mdnTimeout;

var smtp = nm.createTransport({
    host: config.smtpTargetServer.host,
    port: config.smtpTargetServer.port,
    secure: false,
    authOptional: true,
    tls: { rejectUnauthorized: false },
    ignoreTLS: true
});

var doneFolder = config.logging.mdnFolder + 'done';
var processedFolder = config.logging.mdnFolder + 'processed';
var newFolder = config.logging.mdnFolder + 'new';

function buildDSN(dnTo, originalRecipient, originalMessageId, originalMessage, callback){
    var domain = utils.getDomain(originalRecipient);
    var mail = new MailComposer({
        headers: [{contentType: 'multipart/report; report-type=delivery-status'}],
        from: 'MAILER-DAEMON@' + domain,
        to: dnTo,
        subject: 'Undelivered Mail Returned to Sender',
        text: 'This is the mail system at host ' + domain + '.\r\n\r\n' +
              'I\'m sorry to have to inform you that your message could not\r\n' +
              'be delivered to one or more recipients. It\'s attached below.\r\n\r\n' +
              'For further assistance, please send mail to postmaster.\r\n' +
              'If you do so, please include this problem report. You can\r\n' +
              'delete your own text from the attached returned message.\r\n',
        attachments: [{
            contentType: 'message/disposition-notification',
            contentTransferEncoding: '7bit',
            raw: 'Content-Type: message/delivery-status\r\n' +
                 'Content-Description: Delivery report\r\n' +
                     'Content-Transfer-Encoding: 7bit\r\n' +
                     'Content-Disposition: inline\r\n\r\n' +
                     'Final-Recipient: rfc822;' + originalRecipient + '\r\n' +
                     'Original-Recipient: rfc822;' + originalRecipient + '\r\n' +
                     'Original-Message-ID: ' + originalMessageId + '\r\n' +
                     'Action: failed\r\n' +
                     'Status: 5.0.0\r\n' +
                     'Remote-MTA: dns; localhost\r\n' +
                     'Diagnostic-Code: smtp; 554 Transaction failed\r\n'
        },{
            contentType: 'message/rfc822',
            headers: [{'Content-Description': 'Undelivered Message'}],
            content: originalMessage
        }]
    });

    mail.compile().build(callback);
}

function sendXDR(dnTo, originalRecipient, originalMessageId, callback) {
    var message = xdrDisposition.createMessageDisposition('failure', dnTo, originalRecipient, originalMessageId);

    var dest = utils.getDestinationProperties(dnTo);

    xdrConnector.sendMessage(message, dest, logger, function (err) {
        if (err) {
            logger.error('Error while sending message using XDR: ' + err.toString());
            return callback(err);
        }
        logger.info('Message delivered to XDR endpoint');
        return callback();
    });
}

function scan(dir) {
    var now = new Date().getTime();
    fs.readdir(dir, function(err, files) {
        if(err) {
            logger.debug(err);
            return;
        }
        async.each(files, function(file, next) {
                var filePath = dir + '/' + file;
                fs.stat(filePath, function(err, stat) {
                    if (err) {
                        return next(err);
                    }
                    if(!stat.isFile() || new Date(stat.ctime).getTime() + timeout > now) {
                        return next();
                    }
                    var parts = file.split('+');
                    var originalMessageId = parts[0];
                    var dnTo = parts[1]; //original sender
                    var originalRecipient = parts[2]; //original recipient (unreachable/unresponsive)
                    var dest = utils.getDestinationProperties(dnTo);
                    logger.debug('DSN: ' + file);
                    if (dest && dest.type === 'xdr') {
                        sendXDR(dnTo, originalRecipient, originalMessageId, function(xdrErr) {
                            if(xdrErr) {
                                logger.debug(xdrErr);
                                return next();
                            }
                            fs.rename(filePath, path.join(doneFolder, file), function(renameErr){
                                if(renameErr){
                                    logger.debug(renameErr);
                                }
                                return next();
                            });
                        });
                    } else {
                        fs.readFile(dir + '/' + file, function(err, msg){
                            if(err) {
                                logger.debug(err);
                                return next();
                            }
                            buildDSN(dnTo, originalRecipient, originalMessageId, msg, function(err1, message){
                                if(err1) {
                                    logger.debug(err1);
                                    return next();
                                }
                                smtp.sendMail({
                                    envelope: {
                                        from: 'MAILER-DAEMON@' + utils.getDomain(originalRecipient),
                                        to: dnTo
                                    },
                                    raw: message.toString().replace('multipart/mixed;', 'multipart/report; report-type=delivery-status;\r\n')
                                }, function (error) {
                                    if (error) {
                                        logger.debug(error);
                                        return next();
                                    }
                                    fs.rename(filePath, path.join(doneFolder, file), function(err2){
                                        if(err2){
                                            logger.debug(err2);
                                        }
                                        return next();
                                    });
                                });
                            });
                        });
                    }
                });
            }, function(err3) {
                    console.log(dir + ' - all files checked');
                    if(err3) {
                        logger.debug(err3);
                    }
                }
        );
    });
}


setInterval(function() {async.each([newFolder, processedFolder], scan, function(){})}, 15000);

