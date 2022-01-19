var fs = require('fs');
var _ = require('underscore');

var mimeParser = require('../lib/mimeParser.js');
var logger = require('../logger.js');

var content = fs.readFileSync('./test/fixtures/decryptedMessage_no_signer_cert_wrapped_mdn.txt', {encoding: 'utf8'});
var options = { checkMdn: true };
mimeParser.parse(content, options, logger, function(err, parsedMessage, mdnData, isDispatchedMdnRequested) {
    if (err) {
        console.error(err);
    }
    console.log(JSON.stringify(mdnData));
});

