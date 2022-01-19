var async = require('async');

var dnsQuery =  require('../DNS/dnsQuery.js');
var ldapQuery =  require('../LDAP/getCertificatesLDAP.js');
var certificateParser =  require('./certificateParser.js');
var urlUtils = require('../lib/urlUtils.js');
var utils = require('../lib/utils.js');

var DONE = 'done';

/**
 * Find a certificate for a given address. Algorithms to use, in prioritized order:
 *   1 = address bound DNS CERT
 *   2 = domain bound DNS CERT
 *   3 = address bound LDAP
 *   4 = domain bound LDAP
 *
 * @param {String} address Address (sender@domain) for which a certificate is being sought
 * @param {String} localDomain Local domain name - for selecting trust anchors associated with this domain
 * @param {Object} logger Logger object
 * @param {function(Error, String)} callback Returning error or certificate URL (TODO: or certificate as a base64 PEM string?)
 */
function findCertificate(address, localDomain, logger, callback) {
    logger.debug('Trying to find a valid certificate...');
    var domain = urlUtils.getDomain(address);

    var foundCert;

    var validateCert = function(certificate, isAddressBound, cb) {
        async.waterfall([
            async.constant(certificate, localDomain, address, domain, isAddressBound, logger),
            certificateParser.validateCertificate
        ], function(err, isValid) {
            if(err) {
                logger.error('Error validating certificate: ' + err.toString());
                return cb(null, false);
            }
            if(!isValid) {
                return cb(null, false);
            }
            foundCert = certificate;
            cb(null, true);
        });
    };


    async.series([
        findAddressBoundDNSCert,
        findDomainBoundDNSCert,
        findAddressBoundLDAPCert,
        findDomainBoundLDAPCert
    ], function(err) {
        if(err) {
            if(err !== DONE) {
                return callback(err);
            }
        }
        if(!foundCert) {
            logger.debug('No valid certificate found using any algorithm!');
            return callback('No valid certificate found using any algorithm!');
        }

        return callback(null, foundCert);
    });

    function findAddressBoundDNSCert(cb) {
        logger.debug('Trying to find certificate using address-bound DNS');

        async.waterfall([
            async.constant({
                address: address.replace('@','.'),
                log: logger
            }),
            dnsQuery.doCERTQuery
        ], function(err, certs) {
            if(err) {
                logger.error(err, 'Error when searching for certs');
                return cb(null);
            }
            findValidCertificate(certs, true, cb);
        });
    }

    function findDomainBoundDNSCert(cb) {
        logger.debug('Trying to find certificate using domain-bound DNS');

        async.waterfall([
            async.constant({
                address: urlUtils.getDomain(address),
                log: logger
            }),
            dnsQuery.doCERTQuery
        ], function(err, certs) {
            if(err) {
                logger.error(err, 'Error when searching for certs');
                return cb(null);
            }
            findValidCertificate(certs, false, cb);
        });
    }


    function findAddressBoundLDAPCert(cb) {
        findLDAPCert(true, cb);
    }

    function findDomainBoundLDAPCert(cb) {
        findLDAPCert(false, cb);
    }

    function findLDAPCert(isAddressBound, cb) {
        var anyCertsFound = false;
        logger.debug('Trying to find certificate using ' + (isAddressBound ? 'address' : 'domain') + '-bound LDAP');
        var domain = urlUtils.getDomain(address);

        //TODO add address-bound or domain-bound check

        async.waterfall([
            async.constant({
                address: address,
                domain: domain,
                log: logger
            }),
            dnsQuery.doSRVQuery,
            queryLDAPUris
        ], function(err) {
            if(err) {
                logger.error(err, 'Error when searching for certs');
                return cb(null);
            }
            if(foundCert) {
                logger.debug('Found valid ' + (isAddressBound ? 'address' : 'domain') + '-bound LDAP cert!');
                return cb(DONE);
            }
            if(anyCertsFound) {
                logger.debug('No valid ' + (isAddressBound ? 'address' : 'domain') + '-bound LDAP certs found!');
                return cb(DONE);
            }

            return cb(null);
        });

        function queryLDAPUris(uris, cb2) {
            async.detectSeries(uris, function (uri, cbDetect) {
                ldapQuery.ldapQuery(uri, isAddressBound ? address : domain, logger, function(err, certs) {
                    if(err) {
                        logger.debug(err.toString());
                        return cbDetect(null, false);
                    }

                    if(!certs || certs.length === 0) {
                        logger.debug('No certificates for LDAP uri: ' + uri);
                        return cbDetect(null, false);
                    } else {
                        logger.debug("Finished LDAP query: %s cert(s) for uri: %s", certs.length, uri);
                    }
                    anyCertsFound = true;

                    findValidCertificate(certs, isAddressBound, function(err) {
                        if(err) {
                            if(err !== DONE) {
                                logger.error(err.toString());
                                return cbDetect(null, false);
                            }

                            return cbDetect(null, true);
                        }

                        logger.debug('No valid certificates for LDAP uri: ' + uri);
                        return cbDetect(null, false);
                    });
                });
            }, function(err) {
                if(err) {
                    return cb2(err);
                }
                return cb2(null);
            });
        }
    }

    function findValidCertificate(certs, isAddressBound, callback) {
        async.detectSeries(
            certs,
            function(cert, cb) {
                logger.debug('Checking certificate...');
                async.waterfall([
                    async.constant(cert),
                    utils.loadSingleCert,
                    function(pemCert, cb2) {
                        validateCert(pemCert, isAddressBound, cb2);
                    }
                ], cb);
            },
            function(err) {
                if(err) {
                    return callback(err);
                }
                if(foundCert || certs && certs.length > 0) { //if some certs were found and none is valid => fail
                    return callback(DONE);
                }
                return callback(null);
            }
        );
    }
}


module.exports.findCertificate = findCertificate;