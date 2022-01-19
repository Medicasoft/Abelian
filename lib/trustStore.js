var fs = require('fs');
var path = require('path');

function TrustStore(pathToTrustedCert, logger) {
    this.pathToTrustedCert = pathToTrustedCert;
    this.logger = logger;
}

TrustStore.prototype.init = function(callback) {
    var self = this;
    readTrustedCertificates(this.pathToTrustedCert, function(err, anchorHashMap) {
        if(err) {
            return callback(err);
        }
        self.anchorHashMap = anchorHashMap;
        callback(null);
    });
};

function readTrustedCertificates(path, callback) {
    var anchorHashMap = {};
    var self = this;
    fs.readdir(path, function (err, files) {
        if (err){
            self.logger.error("Error while trying to read trusted certificates from directory: " + err.toString());
            return callback(err, null);
        }
        files.forEach(function (file) { //HHHHHHHH.D
            if(/[0-9a-f]{8}\.[0-9]/.test(file)) {
                var hash = file.substring(0, file.indexOf("."));
                anchorHashMap[hash] = file;
            }
        });
        // self.logger.debug('Trust anchor hashes: ', fileNames);
        callback(null, anchorHashMap);
    });
}

TrustStore.prototype.hasAnchor = function(hash) {
    return !!this.anchorHashMap[hash];
};

TrustStore.prototype.getAnchor = function(hash, callback) {
    var filename = this.anchorHashMap[hash];
    var self = this;
    if(!filename) {
        return callback(new Error('Hash not in trust store: ' + hash));
    }
    var anchorPath = path.join(this.pathToTrustedCert, filename);
    fs.readFile(anchorPath, {encoding: 'utf8'}, function(err, file) {
        if(err) {
            return callback(err);
        }
        self.logger.debug('Reading local trust anchor: ' + anchorPath);
        callback(null, file);
    });
};

module.exports.TrustStore = TrustStore;