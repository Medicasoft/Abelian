var _ = require('underscore');

var Mailparser = require('mailparser').MailParser;

/**
 * @callback parseCallback
 * @param {?Object} error
 * @param {Object}  parsedMessage   Message information (parsed with mailparser)
 * @param {Object}  [mdnData]   MDN information. Returned when parseMessage() is called with option.checkMdn=true, parameter not present otherwise.
 * @param {boolean} [isDispatchedMdnRequested]  Whether the message requestes a dispatched MDN. Returned when parseMessage() is called with option.checkMdn=true, parameter not present otherwise.
 */

/**
 * Parse a wrapped/unwrapped message and return the actual contained message from it
 * @param {*}        content
 * @param {Object}  [options]
 * @param {boolean} [options.checkMdn]    Default: false (do not call checkMdnData and isDispatchedMdnRequested)
 * @param {boolean} [options.shalowParse]    Default: false (i.e. full parse by default)
 * @param {Object}        logger
 * @param {parseCallback}      callback
 */
function parse(content, options, logger, callback) {
    if(arguments.length < 4) {
        callback  = logger;
        logger = options;
        options = {};
    }
    options = options || {};

    parseMessage(content, options, logger, function(err, parsedMessage, mdnData, isDispatchedMdnRequested) {
        if (err) {
            return callback(err);
        }
        if (options.shalowParse || !isWrappedMessage(parsedMessage, logger)) {
            return callback(null, parsedMessage, mdnData, isDispatchedMdnRequested, content);
        } else {
            var unwrappedMessage = parsedMessage.attachments[0].content.toString();
            parseMessage(unwrappedMessage, options, logger, function(err, parsedMessage, mdnData, isDispatchedMdnRequested) {
                callback(err, parsedMessage, mdnData, isDispatchedMdnRequested, unwrappedMessage);
            });
        }
    });
}


function readSignedMessage(parsedMsg, sender, rcptTo, logger, callback) {
    var afterFn = function(err, parsedContentMessage, mdnData, isDispatchedMdnRequested) {
        callback(err, parsedContentMessage, mdnData, isDispatchedMdnRequested);
    };

    var contentAttachment = _.findWhere(parsedMsg.attachments, { contentType: 'message/rfc822'});
    if(contentAttachment) {
        //wrapped message
        parseMessage(contentAttachment.content.toString(), { checkMdn: true}, logger, afterFn);
    } else {
        //unwrapped message
        var actualMessage = _.omit(parsedMsg, 'headers', 'attachments');

        if(parsedMsg.attachments.length > 1) { //keep there any other attachment besides the signature
            actualMessage.attachments = _.reject(parsedMsg.attachments, { contentType: 'application/pkcs7-signature'});
        }

        actualMessage.from = sender;
        actualMessage.to = rcptTo;
        actualMessage.headers = {}; //none; ensure no code will fail trying to access headers

        callback(null, actualMessage, checkMdnData(actualMessage), isDispatchedMdnRequested(actualMessage));
    }
}

/**
 * @callback parseMessageCallback
 * @param {?Object} error
 * @param {Object}  parsedMessage   Message information (parsed with mailparser)
 * @param {Object}  [mdnData]   MDN information. Returned when parseMessage() is called with option.checkMdn=true, parameter not present otherwise.
 * @param {boolean} [isDispatchedMdnRequested]  Whether the message requestes a dispatched MDN. Returned when parseMessage() is called with option.checkMdn=true, parameter not present otherwise.
 */

/**
 * Parse message and get MDN type and dispatched MDN request flag
 *
 * @param {String|Object}   content   Message as string or stream
 * @param {Object}          options
 * @param {boolean}        [options.checkMdn=false]    Perform some MDN related checks:
 *                                                      (1) check whether message is a MDN;
 *                                                      (2) if not a MDN, check if a Dispached MDN is requested. Default: false
 * @param {Object}          logger
 * @param {parseMessageCallback}    callback   Callback returning parsed object (Mailparser).
 */
function parseMessage(content, options, logger, callback) {
    if(arguments.length < 4) {
        callback  = logger;
        logger = options;
        options = {};
    }
    options = options || {};

    var parser = new Mailparser();
    parser.once("end", function (data) {
        if(options && options.checkMdn) {
            callback(null, data, checkMdnData(data), isDispatchedMdnRequested(data));
        } else {
            callback(null, data);
        }
    });
    parser.once('error', function (err) {
        logger.error("Error thrown by MailParser: " + err.toString());
        return callback(err);
    });
    if (typeof content === 'object' && typeof content.pipe === 'function') {
        content.pipe(parser);
    } else {
        parser.write(content);
        parser.end();
    }
}

function isWrappedMessage(mail_object, logger) {
    if(!mail_object.headers || !mail_object.headers['content-type']) {
        return;
    }
    var type = mail_object.headers['content-type'];
    var firstVal = type.split(';')[0];
    if(firstVal.toLowerCase() !== 'message/rfc822') {
        return;
    }
    var isWrapped = !!(mail_object.attachments && mail_object.attachments.length > 0 && mail_object.attachments[0].content);
    logger.debug('Message wrapped: ' + isWrapped);
    return isWrapped;
}


var MDN_TAG = 'automatic-action/mdn-sent-automatically';

/**
 * Check whether the message is a MDN and returns MDN type
 *
 * @param {Object} parsedMessage Message parsed from mailparser *
 * @returns {String} MDN notification type (e.g. 'processed'|'dispatched|failed') or undefined is message is not a MDN
 */
function checkMdnData(parsedMessage) {
    var ct = parsedMessage.headers['content-type'];
    var tokens = ct && ct.split(';');
    var isMdn = _.any(tokens, function(token) {
        var index = token.indexOf('=');
        if(token.substring(0, index).trim().toLowerCase() === 'report-type' &&
            token.substring(index+1).trim().toLowerCase().replace(/"|'/g,'') === 'disposition-notification') {
                return true;
            }

    });
    if(!isMdn) {
        return;
    }

    var notifAttachment = _.findWhere(parsedMessage.attachments, {contentType: 'message/disposition-notification'});
    if(!notifAttachment) {
        return;
    }
    var content = notifAttachment.content.toString();
    var lines = content.split(/\r?\n/);

    var notifType;
    var originalMessageId;
    _.each(lines, function(line) {
        var tokens = line.split(':');
        tokens[0] = tokens[0].trim().toLowerCase();

        if(tokens[0] === 'disposition') {
            //searching for Disposition: automatic-action/MDN-sent-automatically;processed
            tokens[1] = tokens[1].trim().toLowerCase();
            var attributes = tokens[1].split(';');
            if(attributes.length < 2 || attributes[0].trim() !== MDN_TAG) {
                return false;
            }
            notifType = attributes[1].trim();
            return true; //stop evaluating next lines
        } else if(tokens[0] === 'original-message-id') {
            //searching for Original-Message-ID: <101904006.42900.1512978502646@ip-172-31-38-171.us-west-2.compute.internal>
            originalMessageId = tokens[1].trim();
        }
    });

    if(notifType && originalMessageId) {
        return {
            type: notifType,
            originalMessageId: originalMessageId
        };
    }
}

function isDispatchedMdnRequested(parsedMessage) {
    if(!parsedMessage.headers['disposition-notification-options']) {
        return false;
    }
    var opts = parsedMessage.headers['disposition-notification-options'];
    opts = opts.replace(/ /g,'').toLowerCase();
    return opts === 'x-direct-final-destination-delivery=optional,true';
}

module.exports = {
    parse: parse,
    readSignedMessage: readSignedMessage
};