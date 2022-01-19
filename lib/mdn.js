var MailComposer = require('nodemailer/lib/mail-composer');

var urlUtils = require('../lib/urlUtils.js');

var MDN_DISPOSITION_FAILED = module.exports.MDN_DISPOSITION_FAILED = 'failed';
var MDN_DISPOSITION_PROCESSED = module.exports.MDN_DISPOSITION_PROCESSED = 'processed';
var MDN_DISPOSITION_DISPATCHED = module.exports.MDN_DISPOSITION_DISPATCHED = 'dispatched';

function buildMdn(mailFrom, dnTo, originalMessageId, subject, disposition, callback) {
    var mail = new MailComposer({
        from: mailFrom,
        to: dnTo,
        subject: disposition.charAt(0).toUpperCase() + disposition.slice(1) + ': ' + subject,
        text: 'Your message was successfully ' + disposition + '.',
        attachments: [{
            raw: 'Content-Type: message/disposition-notification\r\n' +
                'Content-Transfer-Encoding: quoted-printable\r\n' +
                'Content-Disposition: inline\r\n\r\n' +
                'Reporting-UA: ' + urlUtils.getDomain(mailFrom) + ';Abelian\r\n' +
                'Final-Recipient: rfc822;' + dnTo + '\r\n' +
                'Original-Message-ID: ' + originalMessageId + '\r\n' +
                'Disposition: automatic-action/MDN-sent-automatically;' + disposition +
                (disposition === MDN_DISPOSITION_DISPATCHED ? '\r\nX-DIRECT-FINAL-DESTINATION-DELIVERY: ' : '')
        }]
    });

    mail.compile().build(function(err, messageBuffer) {
        if(err) {
            return callback(err);
        }
        var message = messageBuffer.toString().replace('multipart/mixed;', 'multipart/report; report-type=disposition-notification;\r\n');
        callback(null, message);
    });
}

module.exports.buildMdn = buildMdn;
