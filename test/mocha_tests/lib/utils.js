var fs = require("fs");
var config = require("../config");
var ENABLE_LOG = config.enable_log;

module.exports = {
    logMessage: function () {
        if (ENABLE_LOG)
            console.log.apply(this, arguments);
    },
    logError: function () {
        if (ENABLE_LOG)
            console.error.apply(this, arguments);
    },

    generateMessage: function (email) {
        var message = '';
        message += 'from: <' + email.actual.from + '>\n';
        message += 'to: <' + email.actual.to + '>\n';
        message += 'subject: ' + email.actual.subject + '\n';
        message += 'Date: ' + email.actual.date + '\n';
        message += 'Message-ID: ' + email.actual["message-id"] + '\n';
        message += '\n';
        message += email.actual.body;
        return message;
    },

    readAnchor : function (cb, path) {    
        fs.readFile(path, {encoding: "UTF-8" }, function(err, data) {							
            if(err)
                cb(err);
            else
                cb(null, data);
        });
    }
};