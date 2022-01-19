var db = require('./db.js');
var utils = require('../lib/utils.js');

var create_message_qry = 'INSERT INTO messages(recipient, sender, original, msg, domain, guid) VALUES(?, ?, ?, ?, ?, ?);';

module.exports.save = function(recipient, sender, originalMsg, plainMsg, logger, callback) {
    var tokens = recipient.split('@');
    var domain = tokens.length > 1 ? tokens[1] : null;
    var guid = utils.generateGuid();
    db.query(create_message_qry, [recipient, sender, originalMsg, plainMsg, domain, guid], function (err) {
        if(err) {
            logger.error(err, 'Error when creating message');
            return callback(err);
        }

        logger.debug('Inserted new mail with guid ' + guid);
        logger.debug('from=<%s>, to=<%s>, status=received (stored as %s)', sender, recipient, guid);
        callback(null);
    });
};
