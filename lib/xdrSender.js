var fs = require('fs');
var https = require('https');
var config = require("../config.js");
var utils = require('./utils.js');
var url = require('url');

function sendMessage(message, params, logger, contentId, boundary, callback) {
    logger.file('' + contentId + utils.generateGuid(), message);
    logger.info('Sending XDR message to endpoint:' + (params && params.endpoint));
    var urlInfo = url.parse(params && params.endpoint);
    var options = {
        hostname: urlInfo.hostname,
        port: urlInfo.port,
        // port: 12084,
        servername: "test",
        path: urlInfo.pathname,
        // path: '/xdstools/sim/edge-ttp__1/rep/xdrpr',
        // path: '/xdstools/sim/edge-ttp__2/rep/xdrpr',
        // path: '/xdstools/sim/edge-ttp__6/rep/xdrpr',
        // path: '/xdstools/sim/edge-ttp__19mu2/rep/xdrpr',
        // path: '/xdstools/sim/edge-ttp__20amu2/rep/xdrpr',
        // path: '/xdstools/sim/edge-ttp__20bmu2/rep/xdrpr',
        // path: '/xdstools/sim/edge-ttp__48mu2/rep/xdrpr',
        // path: '/xdstools/sim/edge-ttp__10/rep/xdrpr',
        // path: '/xdstools/sim/edge-ttp__11/rep/xdrpr',
        // path: '/xdstools/sim/edge-ttp__49mu2/rep/xdrpr',
        // path: '/xdstools/sim/edge-ttp__50amu2/rep/xdrpr',
        // path: '/xdstools/sim/edge-ttp__50bmu2/rep/xdrpr',
        // path: '/xdstools/sim/edge-ttp__xdrval_alexandru_egner@infoworld_ro/rep/xdrpr',
        method: "POST",
        headers: {
            "Content-Type": "multipart/related; boundary=\"" + boundary + "\"; type=\"application/xop+xml\"; start=\"" + contentId + "\"; start-info=\"application/soap+xml\"; action=\"urn:ihe:iti:2007:ProvideAndRegisterDocumentSet-b\""
        },
        key: fs.readFileSync(config.key),
        cert: fs.readFileSync(config.cert),
        ca: [fs.readFileSync(config.cert)]
    };

    // var options = {
    //     // hostname: 'dev.medicasoft.md',
    //     hostname: 'localhost',
    //     port: 11080,
    //     path: '/xdr',
    //     method: "POST",
    //     headers: {
    //         "Content-Type": "multipart/related; boundary=\"" + boundary + "\"; type=\"application/xop+xml\"; start=\"" + contentId + "\"; start-info=\"application/soap+xml\"; action=\"urn:ihe:iti:2007:ProvideAndRegisterDocumentSet-b\""
    //     },
    //     servername: "test",
    //     key: fs.readFileSync(config.key),
    //     cert: fs.readFileSync(config.cert),
    //     ca: [fs.readFileSync(config.cert)]
    //     // rejectUnauthorized: false
    // };

    options.agent = new https.Agent(options);

    var request = https.request(options, function (res) {
        var resp = "";

        res.setEncoding('utf8');

        res.on('data', function (chunk) {
            resp += chunk.toString();
        });

        res.on('end', function () {
            return callback(null, resp);
        });

        res.on('error', function (e) {
            console.error(e);
        });
    });

    request.on('error', function (err) {
        return callback(err);
    });

    request.write(message);
    request.end();
}

module.exports = {
    sendMessage: sendMessage
};