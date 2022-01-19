var async = require('async');
var getCertificatesLDAP = require('./getCertificatesLDAP.js');

var uri = ['ldap://ldap-unavailable.dcdt31prod.sitenv.org:10389', 'ldap://ldap.dcdt31prod.sitenv.org:11389'];
var mail = 'd10@domain3.dcdt31prod.sitenv.org';

var logger = require('../logger.js');

async.eachSeries(uri, function (url, cb) {
    getCertificatesLDAP.ldapQuery(url, mail, logger, function (err, certs) {
        if (err) {
            console.log(err);
            return cb(err);
        }
        console.log('\nThe certificates for uri ' + url + ' are: \n' );
        console.log(certs);
        cb(null, certs);
    });
}, function (err) {
    if (err) {
        console.log('An uri failed to process');
    } else {
        console.log('All uris have been processed successfully');
    }
});

