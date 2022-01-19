var fs = require('fs');
var certificateParser =  require('../certificateParser/certificateParser.js');
var logger = require('./testLogger.js');
logger = logger.child('ABCD123');

function cb (err) {
    if(err) {
        console.error(err);
    } else {
        console.log('END');
    }
}
// var certificate = fs.readFileSync('./_others/d9_a.pem', {encoding: 'utf8'});
// certificateParser.validateCertificate(certificate, './ca/trust', 'd9@domain1.dcdt31prod.sitenv.org', 'domain1.dcdt31prod.sitenv.org', true, function(err, isValid) {

var certificate = fs.readFileSync('./_others/direct2.sitenv.org.pem', {encoding: 'utf8'});
certificateParser.validateCertificate(certificate, "direct.mu.medicasoft.us", 'provider1@direct2.sitenv.org', 'direct2.sitenv.org', false, logger, function(err, isValid) {
    if(err) {
        return cb(err);
    }
    if(!isValid) {
        return cb(new Error('Certificate is not valid!'));
    }
    cb(null);
});