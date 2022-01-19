var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var config = require('../config.js');

var CAPATH = config.capath;

module.exports.getLocalDomains = function() {
    var items = fs.readdirSync(path.join(CAPATH, 'key'));
    var domains = [];
    _.each(items, function(item){
        if(fs.statSync(path.join(CAPATH, 'key', item)).isDirectory()) {
            domains.push(item);
        }
    });
    return domains;
};

module.exports.getLocalCertificatePath = function (domain) {
    return path.join(CAPATH, 'cert', domain, 'direct.pem');
};

module.exports.getLocalKeyPath = function (domain) {
    return path.join(CAPATH, 'key', domain, 'direct.key');
};

module.exports.getLocalTrustPath = function (domain) {
    return path.join(CAPATH, 'trust', domain);
};