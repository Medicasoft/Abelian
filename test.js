var fs = require('fs');
var Message = require('./lib/message.js').Message;
var message = new Message();
var logger = require('./logger.js');
var msg = fs.readFileSync('./message.txt').toString();
var xdrConnector = require('./lib/xdrConnector.js');

function streamify(text) {
    var Readable = require('stream').Readable;
    var s = new Readable();
    s._read = function noop() {}; // redundant? see update below
    s.push(text);
    s.push(null);
    return s;
}

message.buildFromSMTP(streamify(msg), logger, function(err) {
    if(err) {
        console.error(err);
        return;
    }
    xdrConnector.sendMessage(message, null, logger, function(err1) {
        if(err1) {
            console.error(err1);
            return;
        }
        console.log('Message delivered to XDR endpoint');
    })

    console.log('done');
});