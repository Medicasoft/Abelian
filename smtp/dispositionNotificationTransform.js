/**
 * Add "Disposition-Notification-To:" header to message
 *
 * @param {string} incomingMessage
 * @param {string} from
 * @param {object} logger Bunyan log object
 *
 * @returns {string} Updated message
 */

module.exports.doTransform = function (incomingMessage, from, logger) {
    var dispNotifTo = 'Disposition-Notification-To: ' + from + '\r\n';

    //place before Disposition-Notification-Options:
    var i = incomingMessage.search(/Disposition-Notification-Options/i);
    if (i !== -1) {
        return incomingMessage.substring(0, i) + dispNotifTo + incomingMessage.substring(i);
    }

    //place before From:
    var regexp = /(^|\r\n\s*)(From\s*:.*?\r\n)/i;
    var match = regexp.exec(incomingMessage);
    if (match) {
        return incomingMessage.substring(0, match.index) +
            match[1] + dispNotifTo + match[2] +
            incomingMessage.substring(match.index + match[0].length);
    }

    logger.error('Could not add Disposition-Notification-To header!');

    return incomingMessage;
};