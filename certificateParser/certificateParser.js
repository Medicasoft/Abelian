var fs = require('fs');
var path = require('path');

var x509 = require('x509');
var _ = require('underscore');
var async = require('async');
var request = require('request');

var config = require('../config.js');
var utils = require('../lib/utils.js');
var domainUtils = require('../lib/domainUtils.js');
var TrustStore = require('../lib/trustStore.js').TrustStore;

/**
 * Control how deep to look for a trusted certificate on the certificate chain.
 * Use 0 for unlimited depth.
 */
var MAX_DEPTH = 0;

/**
 * Resolve recursively a certificate chain, starting from an initial certificate (PEM format) or
 *
 * @param {Object}        options
 * @param {String}        options.url                    Url to initial PEM/DER certificate to start resolving chain from. Specify either 'url' or 'certificate' option.
 * @param {string}        options.certificate            PEM certificateto start resolving chain from. Specify either 'url' or 'certificate' option.
 * @param {Object}       [options.parsedCertificate]     Certificate parsed with x509.parse() to start resolving chain from.
 * @param {String[]}      options.trustStore    Hashes for trusted certificates
 * @param {Object}        options.log                    Log
 * @param {*}            [options.revokedList]           Current list of PEM-formated CRLs (certificate revocation list)
 * @param {*}             options.callback
 */
function CertificateChainResolver(trustStore, log) {
    if(!trustStore) {
        throw new Error('options.trustStore is mandatory');
    }
    this.trustStore = trustStore;

    this.log = log;
}


CertificateChainResolver.prototype.resolve = function(options, callback) {
    if(!options || (!options.url && !options.certificate) || (options.url && options.certificate)) {
        throw new Error('Specify either "options.url" or "options.certificate"');
    }

    this.certificateChain = options.certificateChain || [];

    this.revokedList = options.revokedList || [];

    this.certificateHash = options.certificateHash || [];

    if(options.url) {
        this.doResolveUrl(options.url, callback);
    } else { //options.certificate
        this.doResolveCertificate(options.certificate, options.parsedCertificate, callback);
    }
};

CertificateChainResolver.prototype.doResolveUrl = function(url, callback) {
    var data = {
        log: this.log,
        url: url,
        certificateChain: this.certificateChain,
        certificateHash: this.certificateHash,
        trustStore: this.trustStore,
        revokedList: this.revokedList
    };

    async.waterfall([
        function (cb) {
            cb(null, data);
        },
        getCertificate,
        loadCertificate,
        function(data, cb2) {
            data.log.debug('Certificates: ' + data.certificate.length);

            var certs = data.certificate;
            var resultCertData;

            async.detectSeries(_.keys(certs), function(certIndex, cb3) {
                var display = '> '.repeat(data.certificateChain.length + 1) + ' ' + (parseInt(certIndex) + 1) + '/' + certs.length;
                data.log.debug(display + ' processing');

                var parentResolver = new CertificateChainResolver(data.trustStore, data.log);

                var options = {
                    certificate: certs[certIndex],
                    certificateChain: _.clone(data.certificateChain),
                    certificateHash: _.clone(data.certificateHash),
                    revokedList: _.clone(data.revokedList)
                };

                parentResolver.resolve(options, function(err2, resultCertData1) {
                    if(err2) {
                        data.log.error(display + ' error. ' + err2.toString());
                        cb3(null, false);
                    } else {
                        resultCertData = resultCertData1;
                        data.log.info(display + ' done');
                        cb3(null, true); //stop async.detectSeries
                    }
                });
            }, function(err, result) {
                if(err) { return cb2(err); } //no fatal error raised
                if(!result) { return cb2(new Error('No suitable certificate found in tree')); }

                cb2(null, resultCertData); //last certData -> it contained the valid chain
            });
        }
    ], function (err, selectedCertData) {
        if (err) {
            return callback(err);
        }
        callback(null, selectedCertData);
    });
};

function getCertificate(data, cb) {
    // data.log.info("Getting the certificates and convert them to PEM format");
    var currentPath = data.url;

    if(currentPath.indexOf('file://') === 0) {
        data.log.debug('Reading cert from: ' + currentPath);
        fs.readFile(currentPath.substring('file://'.length), {encoding: 'utf8'}, function(err, content) {
            if (err) {
                data.log.error("read file not successful: " + err.toString());
                return cb(err, data);
            }
            data.certificate = content;
            return cb(null, data);
        });
        return;
    }

    if(currentPath.indexOf('http') === 0) {
        data.log.debug('Downloading cert from: ' + currentPath);
        request({
            url: currentPath,
            method: 'GET',
            encoding: null //returns body as Buffer
        }, function (err, res, body) {
            if (err) {
                data.log.error("request.GET not successful: " + err.toString());
                return cb(err, data);
            }
            if (res.statusCode !== 200) {
                var err2 = new Error('Could not download ' + currentPath);
                data.log.error("request.GET not successful: statusCode = " + res.statusCode);
                return cb(err2, data);
            }
            data.certificate = body;
            cb(null, data);
        });
        return;
    }

    return cb(new Error('Unsupported protocol for url: ' + data.url));
}

function loadCertificate(data, cb) {
    var currentPath = data.url;

    var fns = [
        async.constant({cert: data.certificate}),
    ];

    var fileExtension = utils.getFileExtension(currentPath);
    if(fileExtension) {
        data.log.debug('Certificate file extension: ' + fileExtension);
    }

    //try single DER/PEM, then PKCS7 (DER/PEM) bundle
    if (fileExtension !== "p7c" && fileExtension !== "p7b") {
        fns.push(tryFn('singleCert', utils.loadSingleCert));
    }
    fns.push(tryFn('pkcs7', utils.loadPKCS7Bundle));

    async.waterfall(fns, function(err, result) {
        if(!err || err === 'cancel') {
            data.certificate = [].concat(result); //one (string) or more certs (string[])
            return cb(null, data);
        }

        //failed to load
        data.log.warn('Could not load X509 certificate: ' + result.singleCert);
        data.log.warn('Could not load PKCS7 certificate: ' + result.pkcs7);
        return cb(new Error('Could not load certificate'));
    });

    function tryFn(name, fn) {
        return function(data, cb) {
            fn(data.cert, function(err, result) {
                if(err) {
                    data[name] = err;
                    return cb(null, data);
                }
                return cb('cancel', result);
            });
        };
    }
}

/**
 * Resolve a certificate chain starting from a PEM certificate (optionally give a parsed version of the certificate if it's available)
 *
 * @param {string}  certificate         PEM certificate
 * @param {Object}  parsedCertificate   Certificate parsed with x509.parseCert()
 * @param {function(Error,Object)}  callback    Callback function returning error or a result object containing certificate, certificateChain and revokedList
 */
CertificateChainResolver.prototype.doResolveCertificate = function(certificate, parsedCertificate, callback) {
    if(!parsedCertificate) {
        try {
            parsedCertificate = x509.parseCert(certificate);
        } catch(ex) {
            this.log.error({err: ex}, 'Error when parsing certificate');
            return callback(ex);
        }
    }

    var data = {
        log: this.log,
        certificate: certificate,
        parsedCertificate: parsedCertificate,
        certificateChain: this.certificateChain,
        certificateHash: this.certificateHash,
        revokedList: this.revokedList,
        trustStore: this.trustStore
    };

    async.waterfall([
        async.constant(data),
        this.getRevokedList.bind(this),
        this.processCertificate.bind(this)
    ], function(err, resultCertData) {
        callback(err, resultCertData);
    });
};

CertificateChainResolver.prototype.getRevokedList = function (data, cb) {
    if(data.certificateChain.length > 0) {
        return cb(null, data);
    }

    data.log.debug("Getting the CRL");
    var self = this;

    var urls = getCrlUrls(data.parsedCertificate, data.log);
    if(!urls || urls.length === 0) {
        return cb(null, data);
    }

    async.each(urls, function (url, callback) {
        data.log.debug('Downloading CRL from ' + url);
        request({
            url: url,
            method: 'GET',
            encoding: null //returns body as Buffer
        }, function (err, res, body) {
            if (err) {
                data.log.error("CRL GET not successful: " + err.toString());
                return cb(err, data);
            }
            if (res.statusCode !== 200) {
                data.log.error("CRL GET not successful: statusCode = " + res.statusCode);
                return cb(err, data);
            }

            utils.loadCRL(body, function(err, crl) {
                if(err) {
                    data.log.error("Error while trying to get the certificate revocation list: " + err);
                    return cb(err);
                }

                if(self.revokedList.indexOf(crl) === -1) { // do not duplicate CRL
                    self.revokedList.push(crl);
                }
                // data.log.debug("The revoked certificates list of the certificate. Exit code: " + code);
                callback(null, data);
            });
        });
    }, function (err) {
        if (err) {
            return cb(err, data);
        }
        data.log.debug("Finished getting CRL: %s item(s)", self.revokedList.length);
        cb(null, data);
    });
};

/**
 *
 * @param {string} hash Certificate subject hash
 */
function normalizeHash(hash) {
    if(hash.length === 8) {
        return hash;
    }
    return '0'.repeat(8 - hash.length) + hash;
}

CertificateChainResolver.prototype.processCertificate = function (data, cb) {
    var certSubjectHash = normalizeHash(data.parsedCertificate.subjectHash);
    // data.log.file('./parsedCertificate.json', data.parsedCertificate);
    if(data.certificateChain.length > 0) {
        data.log.debug('Intermediate certificate: CN = ' + data.parsedCertificate.subject.commonName, ', subject hash = ' + certSubjectHash);
    }

    if (data.trustStore.hasAnchor(certSubjectHash)) {
        // add anchor instead of the third-party certificate
        data.trustStore.getAnchor(certSubjectHash, function(err, trustAnchor) {
            if(err) {
                return cb(err);
            }
            data.certificateChain.push(trustAnchor);
            data.certificateHash.push(certSubjectHash);
            data.log.debug("Certificate chain: RESOLVED. trust anchor hash = " + certSubjectHash +
                ". Certs chain (" + data.certificateChain.length + "): " + data.certificateHash.join(' > '));

            //check certificate; if valid => end, if not valid, backtrack and check the other options along the chain
            var certificate = data.certificateChain[0];
            var partialChain = data.certificateChain.slice(1);

            data.log.file('cert_' +  data.certificateHash[0] + '.pem', certificate);

            checkCertificate(certificate, partialChain, data.revokedList, data.log, function(err2, isValid) {
                if(err2) {
                    data.log.error('Error while verifing certificate and chain: ' + err2.toString());
                    return cb(err2);
                }
                if(!isValid) {
                    var errInvalid = new Error('The certificate is INVALID!');
                    data.log.error('The certificate is INVALID!');
                    return cb(errInvalid);
                }
                return cb(null, data);
            });
        });
        return;
    }

    if (isCircular(certSubjectHash, data.certificateHash)) {
        var err = new Error('Certificate chain: FAILED. Circular certificate chain at hash = ' + certSubjectHash);
        data.log.error(err.toString());
        return cb(err);
    }

    var certificateIssuerUrl = getCertificateIssuerUrl(data.parsedCertificate, data.log);
    var isRoot = certificateIssuerUrl ? false : true;
    if (isRoot) {
        var err2 = new Error('Certificate chain: FAILED. No trust anchor in certificate chain');
        data.log.error(err2);
        return cb(err2);
    }

    //continue to resolve chain
    if(MAX_DEPTH && data.certificateChain.length >= MAX_DEPTH) {
        return cb(new Error('Max depth reached while parsing certificate chain'));
    }

    this.certificateChain.push(data.certificate);
    this.certificateHash.push(certSubjectHash);
    data.log.debug('Added %s to chain', certSubjectHash);
    // data.log.debug("The path for each certificate in the chain and hashes: " + data.certificateHash);
    this.doResolveUrl(certificateIssuerUrl, function(err, certData){
        if(err){
            // data.log.error("Error while trying to create the certificate chain: " + err.toString());
            return cb(err.toString(), certData);
        }
        cb(null, certData);
    });
};



function findAttribute(fragment, attribute, logger) {
    if(!fragment) {
        return;
    }

    attribute = attribute.trim().toLowerCase();
    var lines = fragment.split(/\r?\n/);

    var result;
    _.any(lines, function(line) {
        if(line.indexOf(':') === -1) {
            logger.debug('Invalid line in AIA extension: ' + line);
            return false;
        }

        var currentAttribute = line.substring(0, line.indexOf(':'));
        if (currentAttribute.trim().toLowerCase() === attribute) {
            result = line.substring(line.indexOf(':') + 1);
            return true; //end search
        }
    });
    return result;
}

function getCertificateIssuerUrl(certificate, logger) {
    if(!certificate.extensions.authorityInformationAccess) {
        logger.warning('No AIA certificate extension!');
        return;
    }
    var issuersUri = findAttribute(certificate.extensions.authorityInformationAccess, 'CA Issuers - URI', logger);
    if(!issuersUri) {
        logger.warning('No CA Issuers - URI attribute in AIA certificate extension! AIA = ' + certificate.extensions.authorityInformationAccess);
        return;
    }
    if(!issuersUri.match(/^https?:\/\//)) { //if not http(s)
        logger.error('Unsupported protocol for CA Issuers - URI! IssuersUri: ' + issuersUri);
        return;
    }

    logger.debug("Issuer certificate urls: " + issuersUri);
    return issuersUri;
}

function isCircular(certSubjectHash, hashArray) {
    return _.any(hashArray, function (hash) {
        return certSubjectHash === hash;
    });
}

function getCrlUrls(certificate, logger) {
    var urls = certificate.extensions.cRLDistributionPoints;
    if(!urls) {
        return;
    }
    var myRegexp = /https?:\/\/(.*)/gi;
    urls = urls.match(myRegexp);
    if(!urls) {
        logger.debug('Unsupported CRL source: ' + urls);
        return;
    }
    logger.debug("CRL urls: " + urls.join('; '));
    return urls;
}


function verifyCertificateOpenssl(certificate, certificateChain, logger, callback) {
    utils.callOpenssl(['verify', '-partial_chain', '-crl_check', '-CAfile', certificateChain], certificate, function(err, output) {
        if(err) {
            logger.error("Certificate validation: NOT OK. " + err.toString());
            return callback(null, false);
        }
        if(output.trim().toLowerCase() !== 'stdin: ok') {
            logger.error("Certificate validation: NOT OK. " + output);
            return callback(null, false);
        }
        logger.debug("Certificate validation: OK");
        callback(null, true);
    });
}

/**
 * Callback for validateChain
 *
 * @callback validateChainCallback
 * @param {object} error    Error
 * @param {String} certificate  PEM-formatted certificate
 * @param {String} certificateChain  The certificate chain includes the trust anchor and any intermediate certificates (all are PEM-formatted).
 * @param {String} certificateRevocationList  CRL certificates list (PEM-formatted)
 *

/**
 * Resolve and return the full certificate chain for a given certificate url
 *
 * @param {String} certificate Actual certificate parsed with x509.parse()
 * @param {Object} parsedCert  Actual certificate parsed with x509.parse()
 * @param {String} pathToTrustedCert Path to local directory containing all trust anchors
 * @param {Object} logger Logger object
 * @param {validateChainCallback} callback Function callback with certificate, chain and CRL; called with error if no valid chain found up to a trusted anchor
 */
function validateChain(certificate, parsedCert, pathToTrustedCert, logger, callback) {
    logger.debug('Getting certificate chain...');

    var trustStore = new TrustStore(pathToTrustedCert, logger);
    trustStore.init(function (err) {
        if (err) {
            logger.error(err.toString());
            return callback(err);
        }

        var resolver = new CertificateChainResolver(trustStore, logger);

        var options = {
            certificate: certificate,
            parsedCertificate: parsedCert
        };

        resolver.resolve(options, function(err, data) {
            if(err){
                logger.error("Error while trying to generate the certificate chain: " + err.toString());
                return callback(err);
            }

            if(data.certificateChain.length === 0) {
                return callback('No certificate resolved!');
            }

            var certificate = data.certificateChain.shift();
            logger.info('Partial chain length: ' + data.certificateChain.length);
            callback(null, certificate, data.certificateChain, data.revokedList);
        });
    });
}

/**
 * Check a certificate using partial certificate chain up to a trusted or root certificate
 *
 * @param {String} certificateChain Certificate chain as string
 * @param {function(Error, boolean)} callback Function returning error or boolean true/false if certificate is valid/invalid
 */
function checkCertificate(certificate, certificateChain, crlList, logger, callback){
    // return callback(null, true); //DEBUG ONLY

    if(certificateChain.length === 0){
        logger.debug("The given certificate is a trust anchor, validate the trust anchor itself");
        certificateChain = [certificate];
    }
    var completeChain = [].concat(certificateChain, crlList).join('\n');

    var caFilePath = path.join(config.pathToCertificateString, 'caFile_' + Date.now().toString()  + '_' + Math.round(Math.random() * 1000000));
    logger.debug("Writing CAfile to temporary location: " + caFilePath);
    fs.writeFile(caFilePath, completeChain, function (err) {
        if(err){
            var errObj = new Error(err.toString());
            logger.error("Error while trying to create the certificate chain: " + err.toString());
            return errObj;
        }
        verifyCertificateOpenssl(certificate, caFilePath, logger, function (err, isValid) {
            if (err) {
                callback(err, isValid);
            }
            callback(null, isValid);
        });
    });
}

var bindingErrPrefix = 'Certificate binding failed: ';

/**
 * Check address/domain bindings for a given certificate
 *
 * @param {Object} parsedCert x509 certificate object
 * @param {String} address Address that should be associated with the certificate
 * @param {String} domain Domain that should be associated with the certificate
 * @param {boolean} isAddressBound Whether the address or the domain must be associated with the certificate
 * @param {Object} logger Logger object
 *
 * @return {Error} Return error if verification fails. Returns undefined if no errors
 */
function verifyBindings(parsedCert, address, domain, isAddressBound, logger) {
    address = address.toLowerCase();
    domain = domain.toLowerCase();

    var subjectAltName;
    if(parsedCert.extensions && parsedCert.extensions.subjectAlternativeName) {
        //TODO support multiple subjectAlternativeName values
        var tokens = parsedCert.extensions.subjectAlternativeName.toLowerCase().split(':'); //e.g. dns:domain.com
        if(tokens.length !== 2) {
            return new Error(bindingErrPrefix + 'invalid subjectAltName ' + parsedCert.extensions.subjectAlternativeName);
        }
        subjectAltName = {};
        subjectAltName[tokens[0]] = tokens[1];
    }

    var emailAddress = parsedCert.subject.emailAddress && parsedCert.subject.emailAddress.toLowerCase();

    logger.debug('Verifying certificate binding. emailAddress = ' + (emailAddress || 'N/A') +
        '; subjectAltName = ' + (parsedCert.extensions.subjectAlternativeName || 'N/A'));

    var error;
    if(isAddressBound) {
        error = checkAddressBound(emailAddress, subjectAltName, address, domain);
    } else {
        error = checkDomainBound(subjectAltName, domain);
    }
    if(error) {
        return error;
    }

    logger.debug('Certificate binding verification: OK');
}

function checkAddressBound(emailAddress, subjectAltName, address, domain) {
    if(emailAddress && subjectAltName && subjectAltName.email && emailAddress !== subjectAltName.email) {
        return new Error(bindingErrPrefix + 'subjectAltName and emailAddress do not match!');
    }

    if(subjectAltName) {
        if(subjectAltName.dns === domain) {
            return; //no error
        } else if(!subjectAltName.email || subjectAltName.email !== address) {
            return new Error(bindingErrPrefix + 'subjectAltName does not match email = ' + address);
        }
    }
    if(emailAddress && emailAddress !== address) {
        return new Error(bindingErrPrefix + 'emailAddress does not match!');
    }
}

function checkDomainBound(subjectAltName, domain) {
    if(!subjectAltName || subjectAltName.dns !== domain) {
        return new Error(bindingErrPrefix + 'subjectAltName does not match domain = ' + domain);
    }
}


function validateCertificate(certificate, localDomain, address, domain, isAddressBound, logger, callback) {
    var parsedCert = x509.parseCert(certificate);
    if(parsedCert.subject.commonName) {
        logger.debug('CN = ' + parsedCert.subject.commonName);
    } else if (parsedCert.subject.emailAddress) {
        logger.debug('Cert subject email address: ' + parsedCert.subject.emailAddress);
    } else {
        logger.debug('Cert subject: ' + JSON.stringify(parsedCert.subject));
    }

    logger.debug('hash = ' + parsedCert.subjectHash);

    logger.debug('Validating certificate for address=%s, domain=%s, isAddressBound=%s, using trust anchors for %s', address, domain, isAddressBound, localDomain);
    var err = verifyBindings(parsedCert, address, domain, isAddressBound, logger);
    if(err) {
        return callback(err);
    }

    validateChain(certificate, parsedCert, domainUtils.getLocalTrustPath(localDomain), logger, function(err){
        if(err) { //invalid certs also return an error
            logger.error('Error while getting certificate chain: ' + err.toString());
            return callback(err);
        }
        callback(null, true);
    });
}



module.exports = {
    validateCertificate: validateCertificate //does: verifyBindings + validateChain + checkCertificate
};