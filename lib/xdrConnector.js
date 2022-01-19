var async = require('async');

var Message = require(__dirname + "/message.js").Message;
var utils = require(__dirname + "/utils.js");
var config = require(__dirname + "/../config.js");
var xdrSender = require(__dirname + "/xdrSender.js");

function generateMessage(xdr, logger, callback) {
    var message = new Message();
    message.buildFromXDR(xdr, logger, function (err) {
        if (err) {
            return callback(err);
        }
        return callback(null, message);
    });
}

function sendMessage(message, params, logger, callback) {
    var boundary = utils.generateBoundary();
    var contentId = message.contentId || utils.generateContentId();
    message.toXDR(params, logger, boundary, function (err, xdrMessages) {
        if (err) {
            logger.error("Could not generate XDR message: " + err);
            return callback(err);
        }
        if (!xdrMessages || !xdrMessages.length) {
            logger.debug("No XDR message generated. Nothing to send on XDR interface.");
            return callback(null);
        }
        async.each(xdrMessages, function (xdrMessage, cb) {
            logger.file('xdrMessageSent_', xdrMessage);
            xdrSender.sendMessage(xdrMessage, params, logger, contentId, boundary, cb);
        }, function (err) {
            return callback(err);
        });
    });
}

/*
When sending a SOAP message using the MIME Multipart/Related Serialization, the SOAP envelope Infoset is serialized as specified in [XML-binary Optimized Packaging] 3.1 Creating XOP packages. Specifically:

The content-type of the outer package MUST be multipart/related.
The type parameter of the content-type header of the outer package MUST have a value of "application/xop+xml" (see [XML-binary Optimized Packaging], 4.1 MIME Multipart/Related XOP Packages).
The startinfo parameter of the content-type header of the outer package MUST specify a content-type for the root part of "application/soap+xml".
The content-type of the root part MUST be application/xop+xml (see [XML-binary Optimized Packaging], 4.1 MIME Multipart/Related XOP Packages).
The type parameter of the content-type header of the root part MUST specify a content-type of "application/soap+xml".
*/
function validateHeaders(xdrHeaders) {
    var multipartCheck, boundaryCheck, typeCheck, contentIdCheck, soapCheck, actionCheck;

    if (!xdrHeaders || !xdrHeaders["content-type"]) {
        return false;
    }

    var tokens = xdrHeaders["content-type"].trim().split(";");
    for (var i in tokens) {
        var token = tokens[i];
        var parts = token.trim().split("=");
        if (parts.length === 1) {
            multipartCheck = parts[0] === "multipart/related";
        } else if (parts.length === 2) {
            parts[1] = stripquotes(parts[1]);
            switch (parts[0]) {
                case "boundary":
                    boundaryCheck = parts[1].startsWith("MIMEBoundary") && parts[1].length > 12;
                    break;
                case "type":
                    typeCheck = parts[1] === "application/xop+xml";
                    break;
                case "start":
                    contentIdCheck = true;
                    break;
                case "start-info":
                    soapCheck = parts[1] === "application/soap+xml";
                    break;
                case "action":
                    actionCheck = parts[1] === "urn:ihe:iti:2007:ProvideAndRegisterDocumentSet-b";
                    break;
            }
        }
    }

    if (multipartCheck && boundaryCheck && typeCheck && contentIdCheck && soapCheck && actionCheck) {
        return true;
    } else {
        return false;
    }
}

function stripquotes(str) {
    if (str.charAt(0) === '"' && str.charAt(str.length - 1) === '"') {
        return str.substr(1, str.length - 2);
    }
    return str;
}

module.exports = {
    validateHeaders: validateHeaders,
    generateMessage: generateMessage,
    sendMessage: sendMessage
};
