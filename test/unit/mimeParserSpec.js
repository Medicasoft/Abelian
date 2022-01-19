var fs = require('fs');
var expect = require('chai').expect;
var _ = require('underscore');

var mimeParser = require(fs.realpathSync('./lib/mimeParser.js'));
var logger = require(fs.realpathSync('./logger.js'));

function parseFully(filename, callback){
    var content = fs.readFileSync('./test/fixtures/' + filename, {encoding: 'utf8'});
    mimeParser.parse(content, { checkMdn: true }, logger, function(err2, parsedMessage, mdnData, isDispatchedMdnRequested) {
        expect(err2).to.be.null;

        //remove content from attachment
        var comparableMessage = _.extend(_.omit(parsedMessage, 'attachments'), {attachments: _.map(parsedMessage.attachments, function(attachment) { return _.omit(attachment, 'content'); })});
        // console.log(JSON.stringify(comparableMessage, null, 4), mdnData, isDispatchedMdnRequested);
        callback(comparableMessage, mdnData, isDispatchedMdnRequested);
    });
}

describe('mimeParser', function() {

    it('should parse unwrapped message', function(done) {
        parseFully('decryptedMessage_no_signer_cert_unwrapped.txt', function(comparableMessage, mdnData, isDispatchedMdnRequested) {
            expect(comparableMessage).to.deep.equal({
                "text": "Body unwrapped",
                "priority": "normal",
                "attachments": [
                    {
                        "contentType": "text/xml",
                        "fileName": "CCDA_Ambulatory.xml",
                        "transferEncoding": "base64",
                        "contentDisposition": "attachment",
                        "generatedFileName": "CCDA_Ambulatory.xml",
                        "contentId": "2f23d4ad618e4c67aa76d6ad9d009a32@mailparser",
                        "checksum": "c18ba089c4bffdcf05071283c9720383",
                        "length": 147
                    },
                    {
                        "contentType": "text/xml",
                        "fileName": "CCDA_Ambulatory2.xml",
                        "transferEncoding": "base64",
                        "contentDisposition": "attachment",
                        "generatedFileName": "CCDA_Ambulatory2.xml",
                        "contentId": "396924d56c180db9b8e557535c31e098@mailparser",
                        "checksum": "c18ba089c4bffdcf05071283c9720383",
                        "length": 147
                    }
                ],
                "headers": {
                    "content-type": "multipart/mixed; boundary=\"----=_Part_19529_740612616.1538036771769\""
                }
            });
            expect(mdnData).to.be.undefined;
            expect(isDispatchedMdnRequested).to.be.false;
            done();
        });
    });

    it('should parse wrapped message', function(done) {
        parseFully('decryptedMessage_no_signer_cert_wrapped.txt', function(comparableMessage, mdnData, isDispatchedMdnRequested) {
            expect(comparableMessage).to.deep.equal({
                "text": "Body wrapped",
                "headers": {
                    "date": "Thu, 27 Sep 2018 08:02:06 +0000 (UTC)",
                    "from": "mr_wrapped@ttpedge.sitenv.org",
                    "to": "pacmariar@patient.orocert.medicasoft.md",
                    "message-id": "<1576398522.19518.1538035326605@ip-172-31-38-171.us-west-2.compute.internal>",
                    "subject": "Test wrapped",
                    "mime-version": "1.0",
                    "content-type": "multipart/mixed; boundary=\"----=_Part_19517_1004159268.1538035326601\""
                },
                "subject": "Test wrapped",
                "messageId": "1576398522.19518.1538035326605@ip-172-31-38-171.us-west-2.compute.internal",
                "priority": "normal",
                "from": [
                    {
                        "address": "mr_wrapped@ttpedge.sitenv.org",
                        "name": ""
                    }
                ],
                "to": [
                    {
                        "address": "pacmariar@patient.orocert.medicasoft.md",
                        "name": ""
                    }
                ],
                "date": new Date("2018-09-27T08:02:06.000Z"),
                "attachments": [
                    {
                        "contentType": "text/xml",
                        "fileName": "CCDA_Ambulatory.xml",
                        "transferEncoding": "base64",
                        "contentDisposition": "attachment",
                        "generatedFileName": "CCDA_Ambulatory.xml",
                        "contentId": "2f23d4ad618e4c67aa76d6ad9d009a32@mailparser",
                        "checksum": "5bc9a976ffa17cb453a26bed7d0237dd",
                        "length": 204
                    }
                ]
            });
            expect(mdnData).to.be.undefined;
            expect(isDispatchedMdnRequested).to.be.false;
            done();
        });
    });

    it('should parse unwrapped MDN', function(done) {
        parseFully('decryptedMessage_no_signer_cert_unwrapped_mdn.txt', function(comparableMessage, mdnData, isDispatchedMdnRequested) {
            expect(comparableMessage).to.deep.equal({
                "text": "Your message was processed successfully. You will receive confirmation when the message is delivered.\n\nPlease do not reply to this message.\n",
                "headers": {
                    "from": "brent.shepherd.1@11287.direct.athenahealth.com",
                    "to": "mariamed@direct.orocert.medicasoft.md",
                    "message-id": "<15906591M11287T20181102083135.reply@11287.direct.athenahealth.com>",
                    "date": "Fri, 2 Nov 2018 08:31:35 -0400",
                    "mime-version": "1.0",
                    "content-type": "multipart/report; boundary=\"1541161895.7F38BEF91.55751\"; report-type=\"disposition-notification\""
                },
                "messageId": "15906591M11287T20181102083135.reply@11287.direct.athenahealth.com",
                "priority": "normal",
                "from": [
                    {
                        "address": "brent.shepherd.1@11287.direct.athenahealth.com",
                        "name": ""
                    }
                ],
                "to": [
                    {
                        "address": "mariamed@direct.orocert.medicasoft.md",
                        "name": ""
                    }
                ],
                "date": new Date("2018-11-02T12:31:35.000Z"),
                "attachments": [
                    {
                        "date": new Date("2018-11-02T12:31:35.000Z"),
                        "contentType": "message/disposition-notification",
                        "transferEncoding": "7bit",
                        "generatedFileName": "attachment",
                        "contentId": "44290cefe42924d04a92d99428a95f27@mailparser",
                        "checksum": "0664b4a9471de26151dc944ef5117fcf",
                        "length": 202
                    }
                ]
            });
            expect(mdnData).to.deep.equal({
                type: 'processed',
                originalMessageId: '<1541161865949@direct.orocert.medicasoft.md>'
            });
            expect(isDispatchedMdnRequested).to.be.false;
            done();
        });
    });

    it('should parse wrapped MDN', function(done) {
        parseFully('decryptedMessage_no_signer_cert_wrapped_mdn.txt', function(comparableMessage, mdnData, isDispatchedMdnRequested) {
            expect(comparableMessage).to.deep.equal({
                "text": "Your Direct message to clayton.willey@my.provider-directmsg.com has been processed at my.provider-directmsg.com on Thu, 01 Nov 2018 14:26:11 GMT.",
                "headers": {
                    "mime-version": "1.0",
                    "to": "mariamed@direct.orocert.medicasoft.md",
                    "from": "clayton.willey@my.provider-directmsg.com",
                    "content-type": "multipart/report; boundary=87d0775ca7644264b11a293425659adf; report-type=disposition-notification",
                    "subject": "processed:Test message (please disregard)",
                    "message-id": "<dbb8cf82-da00-4381-8236-8b1ae5ccf3c2@my.provider-directmsg.com>",
                    "date": "Thu, 01 Nov 2018 10:26:11 -0400",
                    "x-careevmdn": "0",
                    "x-careev-receiveddate": "Thu, 1 Nov 2018 10:26:11 -0400",
                    "x-careevuid": "142626a3dde211e88169005056971597"
                },
                "subject": "processed:Test message (please disregard)",
                "messageId": "dbb8cf82-da00-4381-8236-8b1ae5ccf3c2@my.provider-directmsg.com",
                "priority": "normal",
                "from": [
                    {
                        "address": "clayton.willey@my.provider-directmsg.com",
                        "name": ""
                    }
                ],
                "to": [
                    {
                        "address": "mariamed@direct.orocert.medicasoft.md",
                        "name": ""
                    }
                ],
                "date": new Date("2018-11-01T14:26:11.000Z"),
                "attachments": [
                    {
                        "contentType": "message/disposition-notification",
                        "generatedFileName": "attachment",
                        "contentId": "44290cefe42924d04a92d99428a95f27@mailparser",
                        "checksum": "2d987597c43db7ce92a8455106e0b3b9",
                        "length": 247
                    }
                ]
            });
            expect(mdnData).to.deep.equal({
                type: 'processed',
                originalMessageId: '<1541082244213@direct.orocert.medicasoft.md>'
            });
            expect(isDispatchedMdnRequested).to.be.false;
            done();
        });
    });
});
