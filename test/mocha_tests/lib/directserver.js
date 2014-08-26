/*! Copyright 2014 MedicaSoft LLC USA and Info World SRL
Licensed under the Apache License, Version 2.0 the "License";
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 * Represents a Direct server
 */

var url = require('url');
var request = require('request');
var utils = require("./utils");
var async = require("async");

var DirectServer = function(host, serviceUrl, servicePort, domain) {
    this.host = host;
    this.serviceUrl = serviceUrl;
    this.servicePort = servicePort;
    this.domain = domain;
    //this.user = user;
};
exports.DirectServer = DirectServer;

DirectServer.prototype.getConfigURL = function(route) {
    var r = url.format({hostname: this.serviceUrl, port: this.servicePort, protocol: 'http', pathname: route});
    return r;
};

var requestCall = function(callback, url, method, successCode, urlDetail) {
    var options = Object.create(null);
    options.uri = url;
    options.method = method;
    if (urlDetail) {
        options.json = urlDetail;
    }
    request(options, function(err, res, body) {
        if (err) {
            callback(err);
        } else {
            var code = res.statusCode;
            if (code === successCode) {
                if(res.headers["content-type"] === "application/json")
                    callback(null, body !== undefined && body !== null ? JSON.parse(body) : null);
                else
                    callback(null, body);
            } else {
                utils.logMessage("...failed with unexpected statusCode:" + code + ", body: "+body);
                utils.logMessage(body);
                callback(new Error("Failed: " + method + " " + url + " statusCode:" + code));
            }
        }
    });
};

DirectServer.prototype.addAnchor = function (callback, local_domain, domain, anchor) {
    var url = this.getConfigURL('/Anchor');
    utils.logMessage("...adding server anchor " + url);
    requestCall(callback, url, 'POST', 201, { local_domain_name: local_domain, domain_name: domain, cert: anchor });
};

DirectServer.prototype.removeAnchor = function (callback, local_domain, domain) {    
    var remove = function (err, anchor) {
        if (err) {
            callback(err);
            return;
        }
        if (anchor != null) {
            utils.logMessage("Anchor existed, removing");
            var url = anchor.id;
            utils.logMessage("...removing server anchor " + url);
            requestCall(callback, url, 'DELETE', 204);
        }
        else {
            utils.logMessage("Anchor did not exist, ok!");
            callback(null, null); //no anchor found
        }
    }
    this.findAnchor(remove, local_domain, domain);
};

DirectServer.prototype.removeAnchorById = function (callback, id) {   
    var url = id;
    utils.logMessage("...removing server anchor " + url);
    requestCall(callback, url, 'DELETE', 204);
};

DirectServer.prototype.findAnchor = function (callback, local_domain, domain) {    
    this.listAnchors(function (err, anchors) {
        if (err) {
            callback(err);
            return;
        }
        for (var i in anchors.entry) {
            var anchor = anchors.entry[i];
            if (anchor.content.local_domain_name == local_domain && anchor.content.domain_name == domain) {
                callback(null, anchor);
                return;
            }
        }
        callback(null, null);
    });
};

DirectServer.prototype.deleteAllAnchors = function (callback) {
    utils.logMessage("...deleting all server anchors " + this.host);
    var that = this;
    this.listAnchors(function (err, anchors) {
        if (err) {
            callback(err);
            return;
        }
        var resAnchors = [];        
        async.each(anchors.entry, function (e, cb) {
            that.removeAnchorById(cb, e.id);
        }, callback);
    });
};

DirectServer.prototype.listAnchors = function (callback) {
    var url = this.getConfigURL('/Anchors');
    utils.logMessage("...listing server anchors " + url);
    requestCall(callback, url, 'GET', 200);
};

DirectServer.prototype.addDomain = function(callback, domain, is_local, cert_disco_algo, cert) {
    var url = this.getConfigURL('/Domain');
    utils.logMessage("...adding server domain " + url);
    requestCall(callback, url, 'POST', 201, { name: domain, cert_disco_algo: cert_disco_algo, crypt_cert: cert, is_local: is_local, active: true });
};

DirectServer.prototype.addUser = function(callback, domain, userAddress) {       
    var url = this.getConfigURL('/User');
    utils.logMessage("...adding server user " + url);
    requestCall(callback, url, 'POST', 201, { address: userAddress });
};

DirectServer.prototype.listUsers = function(callback, domain, userAddress) {       
    var url = this.getConfigURL('/Users');
    utils.logMessage("...getting server users " + url);
    requestCall(callback, url, 'GET', 200);
};

DirectServer.prototype.checkUser = function(callback, domain, userAddress, expectedState) {       
    utils.logMessage("...checking server user " + userAddress);
    var check = function(err, body){
        if(err) {
            callback(err);
            return;
        }
        for(var entry in body.entry) {
            if(entry.address == userAddress) {
                if(expectedState == 'present') {
                    callback(null);
                }   
                else {
                    callback(new Error("Failed: check user - user present, but should be absent!"));
                }
                return;
            }
        }
        if(expectedState == 'present')
            callback(new Error("Failed: check user - user absent, but should be present!"));
        else
            callback(null);
    };
    
    this.listUsers(check, domain, userAddress);
};

DirectServer.prototype.getUser = function(callback, domain, userAddress) {       
    utils.logMessage("...getting server user " + userAddress);
    var check = function(err, body){
        if(err) {
            callback(err, null);
            return;
        }
        for(var i in body.entry) {
            if (body.entry[i].content.address == userAddress) {
                callback(null, body.entry[i].content);
                return;
            }
        }
        callback(null, null);
    };
    
    this.listUsers(check, domain, userAddress);
};


DirectServer.prototype.sendMessage = function(callback, message) {
    var url = this.getConfigURL('/Message');
    utils.logMessage("...sending message " + url);
    requestCall(callback, url, 'POST', 200, message);
};

DirectServer.prototype.listMessages = function(callback) {
    var url = this.getConfigURL('/Messages');
    utils.logMessage("...listing messages " + url);
    requestCall(callback, url, 'GET', 200);
};

DirectServer.prototype.getMessage = function (callback, url) {    
    utils.logMessage("...getting messages " + url);
    requestCall(callback, url, 'GET', 200);
};

DirectServer.prototype.deleteMessage = function (callback, url) {
    utils.logMessage("...deleting message " + url);
    requestCall(callback, url, 'DELETE', 204);
};

DirectServer.prototype.deleteAllMessages = function (callback) {
    utils.logMessage("...deleting all server messages " + this.host);
    var that = this;
    this.listMessages(function (err, msgs) {
        if (err) {
            callback(err);
            return;
        }
        
        async.each(msgs.entry, function (e, cb) {
            that.deleteMessage(cb, e.id);
        }, callback);
    });
};
