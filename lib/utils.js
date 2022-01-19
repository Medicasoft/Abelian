var proc = require('child_process');

var _ = require('underscore');
var guid = require('node-uuid');

var config = require('../config.js');
var logger = require('../logger.js');
var urlUtils = require('./urlUtils.js');

//e.g. -----BEGIN
var pemFormatRegex = /^\-+BEGIN/;

//e.g. -----BEGIN CERTIFICATE-----
var x509PemFormatRegex = /^(\-+)BEGIN CERTIFICATE\1/;


function generateGuid() {
    return guid.v4();
}
function generateUuid() {
    return "urn:uuid:" + generateGuid();
}
function generateBoundary() {
    return "MIMEBoundary_" + generateGuid();
}

function generateMessageId() {
    return generateUuid();
}

function generateSmtpMessageId(senderAddress) {
    var domain = urlUtils.getDomain(senderAddress);
    var timeStamp = new Date().getTime();
    logger.debug('Generated Message-ID: ' + timeStamp + '@' + domain);
    return "<" + timeStamp + '@' + domain + ">";
}

function generateContentId() {
    return "<" + generateGuid() + "@domain.com>";
}

function stripContentId(contentId) {
    var _contentId = contentId || generateContentId();
    if (_contentId.startsWith("<") && _contentId.endsWith(">")) {
        _contentId = _contentId.substring(1, _contentId.length - 1);
    }
    return _contentId;
}

function streamToString(stream, callback) {
    var chunks = [];

    stream.on('data', function(data) {
        chunks.push(data);
    });
    stream.on('end', function() {
        callback(null, Buffer.concat(chunks).toString('utf8'));
    });
    stream.on('error', function(err) {
        callback(err);
    });
}


function callOpenssl(args, stdin, cb) {
    logger.debug('Calling: ' + config.opensslPath + ' ' + args.join(' '));

    var buffers = [], errorBuffers = [];

    var child = proc.spawn(config.opensslPath, args);

    child.stdout.on('data', function (info) {
        buffers.push(info);
    });
    child.stderr.on('data', function (errInfo) {
        errorBuffers.push(errInfo);
    });
    child.on('error', function (err) {
        logger.error(err);
        cb(err);
    });
    child.on('close', function (code) {
        if(errorBuffers.length > 0) {
            var errInfo = Buffer.concat(errorBuffers).toString();
            if (errInfo.indexOf('Verification successful') === -1) {
                // logger.debug('openssl error');
                var err = new Error(errInfo);
                return cb(err);
            }
        }
        var stdout = Buffer.concat(buffers).toString();
        if(code !== 0) {
            logger.debug('openssl error; exit code: ' + code + ' stdout: ' + stdout);
            return cb('openssl error; exit code: ' + code + ' stdout: ' + stdout);
        }

        // logger.debug('openssl ok');
        cb(null, stdout);
    });

    child.stdin.write(stdin);
    child.stdin.end();
}

/**
 * Ensure a given certificate is a PEM certificate: transform it from DER when needed
 *
 * @param {String|Buffer} certificate as DER or PEM
 * @param {function(Error, String)} callback Callback to return error or PEM certificate
 */
function loadSingleCert(certificate, callback) {
    if(typeof(certificate) !== 'string' && !Buffer.isBuffer(certificate)) {
        return callback(new Error('Unexpected certificate format'));
    }

    if(typeof(certificate) === 'string') {
        if(certificate.match(x509PemFormatRegex)) {
            return callback(null, certificate);
        }
        return callback(new Error('Invalid format for a x509 PEM certificate!'));
    } else {
        var str = certificate.toString(); //for buffer. TODO optimize this
        if(str.match(x509PemFormatRegex)) {
            return callback(null, str);
        }
    }

    var args = ['x509', '-inform', 'der'];
    callOpenssl(args, certificate, function(err, pemCertificate) {
        if(err) {
            return callback(err);
        }
        logger.debug('Loaded DER certificate');
        callback(null, pemCertificate);
    });
}

function loadPKCS7Bundle(certificate, callback) {
    if(typeof(certificate) !== 'string' && !Buffer.isBuffer(certificate)) {
        return callback(new Error('Unexpected certificate format'));
    }

    var isPEM = false;

    if(typeof(certificate) === 'string') {
        if(certificate.match(pemFormatRegex)) {
            isPEM = true;
        } else {
            return callback(new Error('Invalid format for a PKCS7 PEM-formatted certificate!'));
        }
    } else if(certificate.toString().match(pemFormatRegex)) { //for buffer. TODO optimize this
        isPEM = true;
    }

    var args = ['pkcs7', '-print_certs'];
    if(!isPEM) {
        args = args.concat(['-inform', 'der']);
    }

    callOpenssl(args, certificate, function(err, output) {
        if(err) {
            logger.error(err);
            return callback(err);
        }
        if(!output || output.length === 0) {
            logger.error('Invalid PKCS7 certificate!');
            return callback(new Error('Invalid PKCS7 certificate!'));
        }
        var certs = _.compact(output.split('\n\n'));
        logger.debug('Loaded PKCS7 %s-encoded file with %s certificate(s)', isPEM ? 'PEM': 'DER', certs.length);
        callback(null, certs);
    });
}


/**
 * Get a CRL from a PEM/DER-formatted string or Buffer
 *
 * @param {String|Buffer} crl as DER or PEM
 * @param {function(Error, String)} callback Callback to return error or PEM certificate
 */
function loadCRL(crl, callback) {
    if(typeof(crl) !== 'string' && !Buffer.isBuffer(crl)) {
        return callback(new Error('Unexpected certificate format'));
    }

    var isPEM = false;
    if(typeof(crl) === 'string') {
        if(crl.match(pemFormatRegex)) {
            isPEM = true;
        }
        return callback(new Error('Invalid format for a CRL PEM!'));
    } else {
        var str = crl.toString(); //for buffer. TODO optimize this
        if(str.match(pemFormatRegex)) {
            return callback(null, str);
        }
    }

    var args = ['crl'];
    if(!isPEM) {
        args = args.concat(['-inform', 'der']);
    }

    callOpenssl(args, crl, function(err, pemCRL) {
        if(err) {
            return callback(err);
        }
        logger.debug('Loaded CRL');
        callback(null, pemCRL);
    });
}


function getFileExtension(filePath) {
    var index = filePath.lastIndexOf('.');
    if(index === -1) {
        return;
    }
    return filePath.substring(index + 1);
}

function getDestinationProperties(address) {
    for (var dest in config.destinations) {
        if (config.destinations[dest].regex.test(address)) {
            return config.destinations[dest];
        }
    }

    return null;
}

function mydestinations(address) {
    return (getDestinationProperties(address) !== null);
}

function wrapCertificate(certificate, mark) {
    var parts = certificate.match(/.{1,56}/g);
    var header = '-----BEGIN ' + mark + '-----';
    var footer = '-----END ' + mark + '-----';


    return header + '\n' + parts.join('\n') + '\n' + footer;
}

module.exports = {
    generateGuid: generateGuid,
    generateUuid: generateUuid,
    generateBoundary: generateBoundary,
    generateMessageId: generateMessageId,
    generateSmtpMessageId: generateSmtpMessageId,
    generateContentId: generateContentId,
    streamToString: streamToString,
    stripContentId: stripContentId,
    callOpenssl: callOpenssl,
    loadSingleCert: loadSingleCert,
    loadPKCS7Bundle: loadPKCS7Bundle,
    loadCRL: loadCRL,
    getFileExtension: getFileExtension,
    getDestinationProperties: getDestinationProperties,
    mydestinations: mydestinations,
    wrapCertificate: wrapCertificate
};