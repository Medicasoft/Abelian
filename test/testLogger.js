var syslog;
var fs = require('fs');
var path = require('path');
var _ = require('underscore');

var config = require('../config.js');

syslog = {
    error: console.error.bind(console),
    warning: console.error.bind(console),
    debug: console.log.bind(console),
    info: console.log.bind(console)
};

function formatDateTime(d) {
    var month = (d.getMonth() + 1).toString(),
        day = d.getDate().toString(),
        year = d.getFullYear(),
        hours = d.getHours(),
        minutes = d.getMinutes(),
        seconds = d.getSeconds();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    if (hours.length < 2) hours = '0' + hours;
    if (minutes.length < 2) minutes = '0' + minutes;
    if (seconds.length < 2) seconds = '0' + seconds;

    return [year, month, day].join('-') + '_' + [hours, minutes, seconds].join('-');
}

function file(filename, content) {
    var self = this;
    if (typeof (content) === 'object') {
        content = JSON.stringify(content, null, 4);
    }
    if(filename.lastIndexOf('_') === filename.length -1) {
        filename += formatDateTime(new Date());
    }
    var filePath = path.join(config.logging.folder, filename);
    fs.writeFile(filePath, content, function(err) {
        if (err) {
            self.error('Error while writting content to file: ' + filePath + ' ' + err.toString() );
        } else {
            self.info('Content written to file: ' + filePath);
        }
    });
}


function ChildLogger(name) {
    this.name = name;
}

function wrap(fnName) {
    return function() {
        var fnArgs = Array.prototype.slice.call(arguments);
        if(fnArgs[0] !== undefined && _.isString(fnArgs[0])) {
            fnArgs[0] = this.name + ": " + fnArgs[0];
        }

        syslog[fnName].apply(syslog, fnArgs);
    };
}

ChildLogger.prototype.error = wrap('error');
ChildLogger.prototype.warning = wrap('warning');
ChildLogger.prototype.info = wrap('info');
ChildLogger.prototype.debug = wrap('debug');

ChildLogger.prototype.file = function(filename, content) {
    file.call(this, this.name + '_' + filename, content);
};


function child(name) {
    return new ChildLogger(name);
}

module.exports = {
    error: syslog.error.bind(syslog),
    warning: syslog.warning.bind(syslog),
    info: syslog.info.bind(syslog),
    debug: syslog.debug.bind(syslog),
    file: file.bind(syslog),
    child : child
};