// var fs = require('fs');
// var path = require('path');

var getdns = require("getdns");
var _ = require('underscore');
//var request = require('request');
var async = require('async');
var utils = require('../lib/utils.js');

var options = {
    // timeout: 5000,
    return_dnssec_status: true,
};

var extensions = {
    add_warning_for_bad_dns: true
};

var context = getdns.createContext(options);

/**
 * Query SRV records for a given domain
 *
 * @param {Object} data parameters
 * @param {String} data.domain Address to query for
 * @param {String} data.log Logger object
 * @param {function(err, String[])} callback Function callback returning error or list of LDAP URIs
 */
function doSRVQuery (data, callback) {
    var queryAddress = "_ldap._tcp." + data.domain;
    var logger = data.log;
    logger.debug('Send SRV query: ' + queryAddress);
    context.service(queryAddress, function(err, result){
        if (err) {
            logger.error("Error. Bad result for SRV lookup. " + err.message);
            return callback(err, null);
        }

        var srv_addresses = _.reduce(result.replies_tree, function(memo, tree) {
            return memo.concat(_.map(tree.answer, function(answer) {
                var domain_name = answer.rdata.target;
                return {
                    address: 'ldap://' + domain_name.substring(0,domain_name.length-1) + ':' + answer.rdata.port,
                    weight: answer.rdata.weight,
                    priority: answer.rdata.priority
                };
            }));
        }, []);

        logger.debug('Sorting items by priority (asc) and weight (desc)');
        srv_addresses = srv_addresses.sort(function (a, b) {
            // priority: lower value means more preferred
            // weight: higher value means more preferred
            return a.priority < b.priority ? -1 :
                    (a.priority > b.priority ? 1 :
                        (a.weight < b.weight ? 1 : (a.weight > b.weight ? -1 : 0)));
        });

        _.each(srv_addresses, function(item) {
            logger.debug('Received LDAP address: %s, priority: %s, weight: %s', item.address, item.priority, item.weight);
        });

        var uris = _.pluck(srv_addresses, 'address');

        logger.debug('Results: ' + (uris.length > 0 ? uris : 'none'));
        callback(null, uris);
    });
}

/**
 * Query CERT records for a given address
 *
 * @param {Object} data parameters
 * @param {String} data.address Address to query for
 * @param {String} data.log Logger object
 * @param {function(err, String[])} callback Function callback returning error or list of LDAP URIs
 */
function doCERTQuery(data, callback){
    var addr = data.address;
    var logger = data.log;
    var certs = [];
    context.general(addr, getdns.RRTYPE_CERT, extensions, function(err, result){
        if (err) {
            logger.error("Error. Bad result for lookup. " + err.message);
            return callback(err, certs);
        }

        if (!result) {
            logger.error(new Error("No result for lookup"));
            return callback(new Error("No result for lookup"), certs);
        }

        var replies = result.replies_tree;

        async.each(replies, function(res, callb){
            if(res.bad_dns.length !== 0){
                logger.warning("Warning! Bad DNS Warning", addr, res.bad_dns);
            }

            res.answer = _.sortBy(res.answer, function(answer) { return answer.rdata.key_tag; });

            async.each(res.answer, function(answer, cb){
                if(answer.rdata.algorithm !== 5 && answer.rdata.algorithm !== 8 && answer.rdata.algorithm !== 0){
                    logger.error(new Error("Invalid CERT algorithm"), answer.rdata.algoritm, addr);
                    return cb(null);
                }
                if(answer.rdata.type === 1){
                    certs.push(utils.wrapCertificate(answer.rdata.certificate_or_crl.toString('base64'), 'CERTIFICATE'));
                    cb(null);
                } else if(answer.rdata.type === 4){
                    logger.error(new Error("Invalid CERT type for IPKIX"), answer.rdata.type, addr);
                    return cb(null);
                    // var requestOptions = {
                    //     method: 'GET',
                    //     encoding: null,
                    //     url: res.answer[3]
                    // };
                    // request(requestOptions, function (err, res, body) {
                    //     if (err || res.statusCode !== 200) {
                    //         console.log("IPKIX certificate download failed:", addr, res.answer[3]);
                    //     }
                    //     res = body;
                    //     cb(null);
                    // });
                } else {
                    logger.error("Invalid CERT type: " + answer.rdata.type + ' for address: ' + addr);
                    return cb(null);
                }
            }, function (err) {
                callb(err);
            });
        }, function (err) {
            if (err) {
                logger.error(err, 'Error when searching for DNS certs on address ' + addr);
                return callback(err, certs);
            }
            logger.debug(certs.length + ' DNS certs found for address: ' + addr);
            callback(null, certs);
        });
    });
}

process.on("beforeExit", function(){
    context.destroy();
});

module.exports.doSRVQuery = doSRVQuery;
module.exports.doCERTQuery = doCERTQuery;

