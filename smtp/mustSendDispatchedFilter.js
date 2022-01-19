var _ = require('underscore');

var config = require('../config.js');

var domains = config.localDomainsToSendDispatchedFor;
var addressesRegexList = createRegexList(domains);

function createRegexList(domains) {
    if(!domains || domains.length === 0) {
        return;
    }
    return _.map(domains, function(domain) {
        return new RegExp("@" + domain + "$");
    });
}

module.exports.check = function(address) {
    if(!addressesRegexList) {
        return false;
    }
    return _.any(addressesRegexList, function(regexp) {
        return address.match(regexp);
    });
};