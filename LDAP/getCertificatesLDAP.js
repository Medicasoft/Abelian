
var async = require('async');
var ldap = require('ldapjs');
var config = require('../config.js');


function ldapQuery(uri, mail, logger, callback) {
    var data = {
        log: logger,
        uri: uri,
        mail: mail
    };

    async.waterfall([
        function (cb) {
            cb(null, data);
        },
        getBaseDNs,
        getUserCertificate
    ], function (err) {
        if(data.client) {
            // logger.debug('Closing LDAP client');
            data.client.unbind();
        }

        if (err) {
            data.log.error(err, "LDAP query failed at uri: " + uri + " and address: " + mail);
            return callback(err, data);
        }
        callback(null, data.certs);
    });
}

function getBaseDNs(data, cb) {
    data.certs = [];
    var options = {
        scope: 'base',
        filter: '(objectclass=*)',
        attributes: ['namingContexts'],
        timeLimit: 60000
    };
    data.log.info('Binding LDAP uri: ' + data.uri);
    data.client = ldap.createClient({
        url: data.uri,
        timeout: 60000,
        connectTimeout: 60000,
        idleTimeout: 60000
    });
    data.client.on('error', function (err) {
        data.log.error("A connection to the server could not be established: " + err.toString());
        return cb(null, data);
    });
    // data.log.info('Resolve Base DNs');
    data.client.search('', options, function (err, res) {
        if (err) {
            data.log.error("Error while trying to get Base DNs: " + err.toString());
            return cb(err);
        }
        res.on('searchEntry', function (entry) {
            data.namingContexts = [].concat(entry.object.namingContexts);
        });
        res.on('error', function (err) {
            data.log.error("Client/TCP error: " + err.toString());
            return cb(err);
        });
        res.on('end', function (result) {
            if (result.status === 0) {
                cb(null, data);
            } else {
                var errObj = new Error('status: ' + result.status);
                data.log.error(errObj);
                return cb(errObj);
            }
        });
    });
}

function getUserCertificate(data, cb) {
    var options = {
        scope: 'sub',
        filter: '(mail=' + data.mail + ')',
        attributes: ['userCertificate', 'userCertificate;binary'],
        timeLimit: 60000
    };
    async.eachSeries(data.namingContexts, function (base, callback) {
         data.log.info('Querying base dn: ' + base);
         async.retry({times: config.ldapQueryMaxRetryTimes}, queryBase, callback);
        //  queryBase(callback);

         function queryBase(callback) {
            var baseCerts = [];
            data.client.search(base, options, function (err, res) {
                if (err) {
                    data.log.error("Error while trying to get certificates: " + err.toString());
                    callback(null);
                }
                res.on('searchEntry', function (entry) {
                    // data.log.file('./ldapEntryRaw.json', entry.raw);
                    //  data.log.debug("Finished acquiring the entry object for the given DN and uri.");
                    if (entry.raw.userCertificate) {
                       //  data.log.info('Received LDAP user certificate');
                        baseCerts.push(entry.raw.userCertificate);
                    } else if (entry.raw["userCertificate;binary"]) {
                        data.log.info('Received LDAP user certificate (binary)');
                        baseCerts.push(entry.raw["userCertificate;binary"]);
                    }
                });
                res.on('error', function (err) {
                    data.log.error("Client/TCP error: " + err.toString());
                    callback(err);
                });
                res.on('end', function (result) {
                    if (result.status === 0) {
                        if(baseCerts.length > 0) {
                           data.log.debug(baseCerts.length + ' cert(s) found');
                           data.certs.push.apply(data.certs, baseCerts);
                        } else {
                            data.log.debug('No certs found');
                        }
                        callback(null);
                    } else {
                        var errObj = new Error('status: ' + result.status);
                        data.log.error(errObj);
                        callback(null);
                    }
                });
            });
         }
     }, function (err) {
         if (err) {
             return cb(err);
         }
         cb(null, data);
     });


 }

module.exports = {
    ldapQuery: ldapQuery
};
