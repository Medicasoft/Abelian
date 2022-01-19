var _ = require('underscore');

var config = require('../config.js');
var logger = require('../logger.js');

var knex = require('knex')({
    client: 'mysql',
    connection: config.rest.connString
});

module.exports.transaction = knex.transaction;

/**
 *
 * @param {string} preparedStatement
 * @param {any[]} [parameters]
 * @param {function(error, object)} callback
 */
module.exports.query = function(preparedStatement, parameters, callback) {
    if(!callback) {
        callback = parameters;
        parameters = [];
    }

    //ensure null as default (undefined is rejected with error)
    parameters = _.map(parameters, function(p) { return p === undefined ? null : p; });

    // logger.debug({statement: preparedStatement, params: parameters}, 'Executing db statement');
    knex.raw(preparedStatement, parameters).asCallback(function (err, resp) {
        // logger.debug({err: err}, 'Executed db statement');
        if(err) {
            return callback(err);
        }
        //for mysql
        var rows = resp[0];
        // var headers = resp[1];
        var result = {
            rows: rows,
            rowCount: rows.length
        };
        callback(null, result);
    });
};