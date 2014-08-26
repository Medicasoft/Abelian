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

var fs = require("fs");
var config = require("../config");
var ENABLE_LOG = config.enable_log;

var logMessage = function () {
    if (ENABLE_LOG)
        console.log.apply(this, arguments);
};
var logError = function () {
    if (ENABLE_LOG)
        console.error.apply(this, arguments);
};

module.exports = {
    logMessage: logMessage,
    logError: logError,

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
            if (err) {
                logError('Path cannot be read! ' + path);
                cb(err);
            }
            else {
                logMessage('Path was read: ' + path + " with data.length " + data.length);
                cb(null, data);
            }
        });
    }
};