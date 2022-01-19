var fs = require('fs');
var path = require('path');
var config = require('./config.js');
var logger = require('./logger.js');


var doneFolder = config.logging.mdnFolder + 'done';
var processedFolder = config.logging.mdnFolder + 'processed';
var newFolder = config.logging.mdnFolder + 'new';

function formatFileName(messageId, fromAddress, toAddress) {
    return messageId + '+' + fromAddress + '+' + toAddress;
}

module.exports.saveNewOutgoingMessage = function(messageId, fromAddress, toAddress, processedMessage) {
    var filename = config.logging.mdnFolder + 'new/' + formatFileName(messageId, fromAddress, toAddress);
    logger.debug('new file: ' + filename);
    fs.writeFile(filename, processedMessage, function(err) {
        if (err) {
            logger.error('Error while writting content to file: ' + filename + ' ' + err.toString() );
        } else {
            logger.info('Content written to file: ' + filename);
        }
    });
};

function moveNewFile(filename, cb) {
    fs.rename(path.join(newFolder, filename), path.join(processedFolder, filename), cb);
}

function moveProcessedFile(filename, cb) {
    fs.rename(path.join(processedFolder, filename), path.join(doneFolder, filename), cb);
}

module.exports.moveMessage = function(messageId, fromAddress, toAddress, mdnType, callback) {
    logger.debug('move message: messageId = ' + messageId + ', fromAddress = ' + fromAddress + ', toAddress = ' + toAddress + ', received MDN: ' + mdnType);

    var filename = formatFileName(messageId, fromAddress, toAddress);
    if(mdnType === 'processed') {
        moveNewFile(filename, function(err) {
            if(err) {
                // logger.error('Could not move file (received processed MDN): ' + filename + '. ' + err.toString());
            } else {
                logger.debug('Moved file from "new" to "processed" folder (received processed MDN): ' + filename);
            }
            return callback(null);
        });
    } else if(mdnType === 'dispatched' || mdnType === 'failed') {
        moveProcessedFile(filename, function(err) {
            if(err) {
                //maybe no processed MDN received until now, try in 'new' folder
                moveNewFile(filename, function(err1) {
                    if(err1) {
                        // logger.error('Could not move file (received dispatched MDN): ' + filename + '. ' + err.toString());
                    } else {
                        logger.debug('Moved file from "new" to "done" folder (received dispatched MDN): ' + filename);
                    }
                    return callback(null);
                });
            } else {
                logger.debug('Moved file from "processed" to "done" folder (received dispatched MDN): ' + filename);
                return callback(null);
            }
        });
    } else {
        // logger.error('Message moving failed, unknown MDN type: ' + mdnType);
        callback(null);
    }
};


