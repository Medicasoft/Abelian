var Message = require('./message.js').Message;
var utils = require('./utils.js');
var config = require('../config.js');

/**
 * Generate an XDR Message Disposition object *
 *
 * @param {'failure'|'success'} dispType Disposition type
 * @param {String} dnTo Message recipient (original sender)
 * @param {String} originalRecipient Original recipient
 * @param {String} originalMessageId Message-ID from the original message
 * @returns {Object} XDR Message
 */
module.exports.createMessageDisposition = function(dispType, dnTo, originalRecipient, originalMessageId) {
    var message = new Message();
    message.contentId = utils.generateContentId();
    message.date = new Date();
    message.from = 'MAILER-DAEMON@' + utils.getDomain(originalRecipient);
    message.to = [dnTo];
    message.subject = (dispType === 'success' ? 'Success' : 'Failure') + ' mdn';
    message.attachments = [{
        content: '<direct:messageDisposition xmlns:direct="urn:direct:addressing">\n' +
        '    <direct:recipient>' + originalRecipient + '</direct:recipient>\n' +
        '    <direct:disposition>' + (dispType === 'success' ? 'success' : 'failure')  + '</direct:disposition>\n' +
        '</direct:messageDisposition>',
        contentType: 'text/xml',
        transferEncoding: 'binary',
        contentId: utils.generateContentId()
    }];
    message.relatesToMessageId = utils.stripContentId(originalMessageId);
    return message;
}