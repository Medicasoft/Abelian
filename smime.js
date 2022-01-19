var path = require('path');
var os = require('os');
var fs = require('fs');

var _ = require('underscore');
var async = require('async');
var nm = require('nodemailer');

var config = require('./config.js');
var utils = require('./lib/utils.js');
var urlUtils = require('./lib/urlUtils.js');
var certificateDiscovery = require('./certificateParser/certificateDiscovery.js');

var mimeParser = require('./lib/mimeParser.js');
var mdn = require('./lib/mdn.js');
var certificateParser = require('./certificateParser/certificateParser.js');
var domainUtils = require('./lib/domainUtils.js');

var smtp = nm.createTransport({
    host: config.smtpTargetServer.host,
    port: config.smtpTargetServer.port,
    secure: false,
    authOptional: true,
    tls: { rejectUnauthorized: false },
    ignoreTLS: true
});


/**
 * Encrypt an outgoing message (from a local domain address to an external recipient)
 * Note: only one recipient supported for the moment
 *
 * @param {String} Message
 * @param {String} senderAddress Sender for the DIRECT email address: username@domain (a local address)
 * @param {String} recipientAddress Recipient for the DIRECT email address: username@domain (an external address)
 * @param {function(Error, String)} callback Callback function returning encrypted message
 */
var encrypt = module.exports.encrypt = function (message, senderAddress, recipientAddress, logger, callback) {
    //1. get recipient public certificate -> for encryping (resolved using certificate discovery)
    //2. validate recipient public certificate
    //3. perform signing and encryption

    var localDomain = urlUtils.getDomain(senderAddress);

    var data = {
        senderAddress: senderAddress,
        recipientAddress: recipientAddress,
        localDomain: localDomain,
        message: wrapMessage(message),
        log: logger
    };

    async.waterfall([
        async.constant(data),
        discoverRecipientCert,
        writeRecipientCert,
        signMessage,
        encryptMessage,
    ], function(err) {
        if(err) {
            return callback(err);
        }
        callback(null, data.message);
    });
};



function discoverRecipientCert(data, cb2) {
    certificateDiscovery.findCertificate(data.recipientAddress, data.localDomain, data.log, function(err, recipientCertificate) {
        if(err) {
            return cb2(err);
        }
        data.recipientCertificate = recipientCertificate;
        cb2(null, data);
    });
}

function writeRecipientCert(data, cb2) {
    data.recipientCertPath = path.join(os.tmpdir(), data.recipientAddress.replace('@','.') + '_' + Math.round(Math.random() * 1000000));
    fs.writeFile(data.recipientCertPath, data.recipientCertificate, function(err) {
        if(err) {
            data.log.error('Error writing certificate', err.toString());
            return cb2(err);
        }
        data.log.debug('Certificate written to', data.recipientCertPath);
        cb2(null, data);
    });
}

var RFC822 = "content-type: message/rfc822\r\n\r\n";
function wrapMessage(message) {
    return RFC822 + message;
}

function signMessage(data, cb) {
    var senderCertPath = domainUtils.getLocalCertificatePath(data.localDomain);
    var senderKeyPath = domainUtils.getLocalKeyPath(data.localDomain);

    data.log.debug('Signing with certificate and key:', senderCertPath, senderKeyPath);

    utils.callOpenssl(['cms', '-sign', '-signer', senderCertPath, '-inkey', senderKeyPath, '-md', 'sha256'], data.message, function(err, signedMessage) {
        if(err) {
            return cb(err);
        }
        data.log.file('signed', signedMessage);
        data.message = signedMessage;
        return cb(null, data);
    });
}

function encryptMessage(data, cb) {
    data.log.debug('Encrypting with certificate:', data.recipientCertPath);

    utils.callOpenssl(['cms', '-encrypt', '-recip', data.recipientCertPath, '-aes128', '-to', data.recipientAddress, '-from', data.senderAddress], data.message, function(err, encryptedMessage) {
        if(err) {
            return cb(err);
        }
        data.log.file('encrypted', encryptedMessage);
        data.message = encryptedMessage;
        return cb(null, data);
    });
}


module.exports.decrypt = function (message, sender, rcptTo, logger, callback) {
    var domain = urlUtils.getDomain(rcptTo);

    var data = {
        message: message,
        domain: domain,
        sender: sender,
        rcptTo: rcptTo,
        log: logger
    };
    async.waterfall([
        async.constant(data),
        decryptMessage,
        verifySignature,
        verifyMessage,
        parseContent,
        sendProcessedMdn
    ], function(err) {
        if(err) {
            return callback(err);
        }
        callback(null, {
            parsedMessage: data.parsedMessage,
            decryptedMessage: data.unwrappedMessage, // decrypted and unwrapped message
            mdnData: data.mdnData,
            isDispatchedMdnRequested: data.isDispatchedMdnRequested,
        });
    });
};


function decryptMessage(data, cb) {
    var recipCertPath = domainUtils.getLocalCertificatePath(data.domain);
    var recipKeyPath = domainUtils.getLocalKeyPath(data.domain);
    data.log.debug('Decrypting message with recipient cert, recipient private key:', recipCertPath, recipKeyPath);

    utils.callOpenssl(['cms', '-decrypt', '-recip', recipCertPath, '-inkey', recipKeyPath], data.message, function(err, decryptedMessage) {
        if(err) {
            return cb(err);
        }
        data.log.file('decryptedMessage_', decryptedMessage);
        data.message = decryptedMessage;
        return cb(null, data);
    });
}


function wrapLongLineContent(mime) {
    var signaturePartRegex = /Content\-Type:\s*application\/pkcs7\-signature/i;
    var res = signaturePartRegex.exec(mime);
    if(!res) {
        console.log('Could not find signature!');
        return mime;
    }

    var emptyLine = '\r\n\r\n';
    var signatureStartIndex = mime.indexOf(emptyLine, res.index); //the content for a MIME-part is placed after an empty line

    return mime.substring(0, signatureStartIndex + emptyLine.length) +
        //match an one-line content (Base64) line with CRLFs followed by a '--' (boundary markup) beginning of line
        mime.substring(signatureStartIndex + emptyLine.length).replace(/^[a-zA-Z0-9\/\+]{77,}(\=)*(?=(\r\n)+\-\-)/, function(str) {
            console.log('Fixing long signature');
            var parts = str.match(/.{1,76}/g);
            return parts.join('\r\n');
        });
}


function verifyMessage(data, cb) {
    data.log.debug('Verifying message');
    var normalizedMessage = wrapLongLineContent(data.message);
    utils.callOpenssl(['cms', '-verify', '-no_signer_cert_verify'], normalizedMessage, function(err, result) {
        if(err) {
            return cb(err);
        }
        data.log.file('decryptedMessage_no_signer_cert_', result);
        data.message = result;
        return cb(null, data);
    });
}

function sendProcessedMdn(data, cb) {
    if(data.mdnData) {
        return cb(null, data);
    }
    var mdnSender = data.rcptTo;
    var mdnRecipient = data.sender;
    var originalMesageId = data.parsedMessage.headers['message-id'] || data.parsedDecryptedMsg.headers['message-id'];

    sendMdn(mdnSender, mdnRecipient, originalMesageId, data.parsedMessage.subject, mdn.MDN_DISPOSITION_PROCESSED, data.log, function(err) {
        if (err) {
            data.log.error('Error while preparing and sending MDN:' + err.toString());
        }
        return cb(null, data); //TODO review this - now hiding error occurred while building the MDN
    });
}

var sendMdn = module.exports.sendMdn = function (mailFrom, dnTo, originalMessageId, subject, disposition, logger, callback) {
    logger.debug('Preparing MDN: ', mailFrom, dnTo, originalMessageId, disposition);
    mdn.buildMdn(mailFrom, dnTo, originalMessageId, subject, disposition, function(err, mdnMessage) {
        if (err) {
            return callback(err);
        }
        logger.file('mdn_' + disposition + '_', mdnMessage);
        encrypt(mdnMessage, mailFrom, dnTo, logger, function(err2, encryptedMdn) {
            if (err2) {
                return callback(err2);
            }

            smtp.sendMail({
                envelope: {
                    from: mailFrom,
                    to: dnTo
                },
                raw: encryptedMdn
            }, function (err, info) {
                if (err) {
                    return callback(err);
                }
                logger.info('Successfully sent ' + disposition + ' MDN using SMTP ' +  JSON.stringify(info));
                return callback(null);
            });
        });
    });
};

function verifySignature(data, cb) {
    data.log.debug('Verifying message signature');

    mimeParser.parse(data.message, { shalowParse: true }, data.log, function(err, result) {
        if (err) {
            data.log.error('Error while parsing message before signature verify: ' + err.toString());
            return cb(err);
        }

        var signatureAttachment = _.findWhere(result.attachments, { contentType: 'application/pkcs7-signature'});
        if (!signatureAttachment) {
            data.log.error('Message signature not found.');
            return cb(new Error('Message signature not found.'));
        }
        var signature = signatureAttachment.content.toString('base64');
        var parts = signature.match(/.{1,76}/g);
        signature = '-----BEGIN PKCS7-----\n' + parts.join('\n') + '\n-----END PKCS7-----';
        utils.loadPKCS7Bundle(signature, function(err, certs) {
            if(err) {
                data.log.error('Invalid message signature: ' + err.toString());
                return cb(err);
            }
            data.log.debug(certs.length + ' certs found in attached signature');
            async.detectSeries(certs, function(cert, detectCb) {
                certificateParser.validateCertificate(cert, data.domain, data.sender, urlUtils.getDomain(data.sender), true, data.log, function(err2, isValid) {
                    if(err2) {
                        data.log.error('Error while verifing signature: ' + err2.toString());
                        return detectCb(false);
                    }
                    if(!isValid) {
                        data.log.error('Invalid signing certificate.');
                        return detectCb(false);
                    }

                    data.log.info('A valid signing certificate was found.');
                    return detectCb(true);
                });
            }, function(validSigningCert) {
                if(!validSigningCert) {
                    return cb(new Error('No valid signing certificate found!'));
                }

                data.parsedDecryptedMsg = result;
                return cb(null, data);
            });
        });
    });
}

function parseContent(data, cb) {
    var afterFn = function(err, parsedMessage, mdnData, isDispatchedMdnRequested, unwrappedMessage) {
        if(err) {
            data.log.error('Error while parsing actual message content attachment: ' + err.toString());
            return cb(err);
        }
        data.parsedMessage = parsedMessage;
        data.unwrappedMessage = unwrappedMessage;
        data.mdnData = mdnData;
        if(data.mdnData) {
            data.log.debug('Message is a ' + data.mdnData.type + ' MDN!');
        } else {
            data.isDispatchedMdnRequested = isDispatchedMdnRequested;
            data.log.debug('Dispatched MDN requested: ' + isDispatchedMdnRequested);
        }
        data.log.file('parsedMessage_', JSON.stringify(data.parsedMessage, null, 4));
        return cb(null, data);
    };

    mimeParser.parse(data.message, { checkMdn: true }, data.log, afterFn);
}


