var fs = require('fs');
var _ = require('underscore');

var mimeParser = require('../lib/mimeParser.js');
var logger = require('../logger.js');

// var content = fs.readFileSync('./test/fixtures/decryptedMessage_no_signer_cert_unwrapped.txt', {encoding: 'utf8'});
var content = fs.readFileSync('./test/fixtures/decryptedMessage_no_signer_cert_wrapped.txt', {encoding: 'utf8'});

mimeParser.parse(content, { checkMdn: true }, logger, function(err, parsedMessage, mdnData, isDispatchedMdnRequested, unwrappedMessage) {
    if (err) {
        console.error(err);
    }
    console.log(JSON.stringify(parsedMessage, null, 4), mdnData, isDispatchedMdnRequested);
    console.log(unwrappedMessage);
});