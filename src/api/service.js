var pg = require('pg'),
	restify = require('restify'),
	util = require('util'),
	es = require('event-stream'),
	cp = require('child_process'),
	fs = require('fs'),
	async = require('async'),
	uuid = require('node-uuid'),
	anchor = require('./anchor.js'),
	user = require('./user.js'),
	bundle = require('./bundle.js'),
	config = require('./config.js'),
    resources = require('./resources.js');

//var get_messages_qry = 'SELECT * FROM messages LIMIT $1 OFFSET $2;';
var get_message_qry = 'SELECT * FROM messages WHERE id = $1;';
var del_message_qry = 'DELETE FROM messages WHERE id = $1;';

var connString = config.connString;
var port = config.port;
var baseUrl = config.baseUrl;

//REST server
var server = restify.createServer( { name: 'abelian' });
//plugins
server.use(restify.queryParser());
server.use(restify.CORS({ origins : ['*'], headers : ['location']}));
//routes
server.get('/Message/:id', getMessage);
server.get('/Messages', getMessages);
server.post('/Message', restify.bodyParser(), sendMessage);
server.del('/Message/:id', deleteMessage);
user.registerRoutes(server);
anchor.registerRoutes(server);
bundle.registerRoutes(server);
//start server
server.listen(port, function() {
	console.log('%s listening at %s', server.name, server.url);
});
	
function getMessage(req, res, next) {
	pg.connect(connString, function(err, client, done) {  
		if(err) {
			console.error('error fetching client from pool', err);
			res.send(500);
			return next();
		} else {
		    client.query(get_message_qry, [req.params.id], function (err, result) {
		        done();
		        if (err) {
		            console.error('error running query', err);
		            res.send(500);
		            return next();
		        }
	                if (result.rowCount == 0) {
        	            res.send(404);
                	    return next();
	                }

		        var msg = result.rows[0].msg;
		        res.header('Content-Type', 'application/mime');
		        res.send(200, msg);
		    });
		}
	});
}

function getMessages(req, res, next) {
    resources.getEntities(req, res, next, 'Message');
}

//function getMessages(req, res, next) {   
//	pg.connect(connString, function(err, client, done) {  
//		if(err) {
//			console.error('error fetching client from pool', err);
//			res.send(500);
//			return next();
//		} else {
//		    client.query(get_messages_qry, function (err, result) {
//		        done();
//		        if (err) {
//		            console.error('error running query', err);
//		            res.send(500);
//		            return next();
//		        }

//		        var count = result.rows.length;
//		        var msgs = {
//		            totalResults: count,
//		            entry: []
//		        };

//		        for (var i = 0; i < count; i++) {
//		            var row = result.rows[i];
//		            var message = {
//		                id: baseUrl + 'Message/' + row.id, //full GET url
//		                to: row.recipient //,
//		                //size : row.messagesize,
//		                //status : row.status
//		            };
//		            msgs.entry.push(message);
//		        }
//		        res.send(200, msgs);
//		    });
//		}
//	});
//}

function sendMessage(req, res, next) {
	async.waterfall([
		function(callback) {
			callback(null, req);
		},
		saveMessage
	], function(err, result) {
		if(err === null) {	 
            console.log('smimesend.py successfully sent a message');        
			res.send(200);
			return;
		}
        console.error('smimesend.py error:' + err);   
        
		if(err.code === 2) {
			res.send(400, 'Mail headers missing');
			return;
		}
		if(err.code === 1) {
			res.send(422, 'Validation failed');
			return;
		}
		
		res.send(500, err);		
	});
}

function saveMessage(req, callback) {
    var child = cp.exec('./smimesend.py', {cwd: '/var/spool/direct/' }, function(err, stdout, stderr) {
        if(stderr !== '')
            console.error('smimesend.py stderr: ' + stderr);
       
		callback(err);
	});
    child.stdin.write(req.body);
	child.stdin.end();
}

function deleteMessage(req, res, next) {
	pg.connect(connString, function(err, client, done) {  
		if(err) {
			console.error('error fetching client from pool', err);
			res.send(500);
			return next();
		} else {
		    client.query(del_message_qry, [req.params.id], function (err, result) {
		        done();
		        if (err) {
		            console.error('error running query', err);
		            res.send(500);
		            return next();
		        }

		        res.send(204); //no content
		    });
		}
	});
}




