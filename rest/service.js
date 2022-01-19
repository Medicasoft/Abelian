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

var restify = require('restify'),
	message = require('./message.js'),
	logger = require('../logger.js'),
	user = require('./user.js'),
	config = require('../config.js').rest;

var port = config.port;

module.exports.init = function() {
    //REST server
    var server = restify.createServer({ name: 'abelianjs' });
    //plugins
    server.use(restify.queryParser());
    server.use(restify.CORS({ origins : ['*'], headers : ['location']}));
    //routes
    message.registerRoutes(server);
    user.registerRoutes(server);
    //start server
    server.listen(port, function() {
        console.log('%s listening at %s', server.name, server.url);
    });
};


