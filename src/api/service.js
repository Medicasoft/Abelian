var pg = require('pg'),
	restify = require('restify'),
	util = require('util'),
	es = require('event-stream'),
	cp = require('child_process'),
	fs = require('fs'),
	async = require('async'),
	uuid = require('node-uuid'),
    user = require('./user.js'),
    config = require('./config.js');

var get_messages_qry = 'SELECT * FROM messages;';
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
server.post('/Message', sendMessage);
server.del('/Message/:id', deleteMessage);
user.registerRoutes(server);

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

		        var msg = result.rows[0].msg;
		        res.header('Content-Type', 'application/mime');
		        res.send(200, msg);
		    });
		}
	});
}

function getMessages(req, res, next) {
	pg.connect(connString, function(err, client, done) {  
		if(err) {
			console.error('error fetching client from pool', err);
			res.send(500);
			return next();
		} else {
		    client.query(get_messages_qry, function (err, result) {
		        done();
		        if (err) {
		            console.error('error running query', err);
		            res.send(500);
		            return next();
		        }

		        var count = result.rows.length;
		        var msgs = {
		            count: count,
		            messages: []
		        };

		        for (var i = 0; i < count; i++) {
		            var row = result.rows[i];
		            var message = {
		                id: baseUrl + 'Message/' + row.id, //full GET url
		                to: row.recipient //,
		                //size : row.messagesize,
		                //status : row.status
		            };
		            msgs.messages.push(message);
		        }
		        res.send(200, msgs);
		    });
		}
	});
}

function sendMessage(req, res, next) {
	async.waterfall([
		function(callback) {
			callback(null, req);
		},
		saveMessage,
		getRecipientCert,
		encryptMessage,
		sendMail
	], function(err, result) {
		err === null ? res.send(200) : res.send(500, err);
	});
}

function saveMessage(req, callback) {
    var meta = {
        id: uuid.v1(),
        from: '',
        to: ''
    };
		
	req.pipe(es.split())
		.pipe(es.map(function(line, cb){
			if(meta.to === ''){
				var m = line.match(/^to:[^<]*<(.+)>$/i);
				if(m !== null){
					meta.to = m[1];
				}
			}
			if(meta.from === ''){
				m = line.match(/^from:[^<]*<(.+)>$/i);
				if(m !== null){
					meta.from = m[1];
				}
			}

			cb(null, line);
		}))
		.pipe(es.join('\n'))
		.pipe(fs.createWriteStream(meta.id + '.msg'));
	
	req.on('end', function () { 
		callback(null, meta);
	});
}

function getRecipientCert(meta, callback) {
	var field = 0,
	    modulus = 0;
	var ws = fs.createWriteStream(meta.id + '.crt');
	
	ws.on('open',function() {
		es.child(cp.exec('dig CERT +short ' + meta.to.replace('@', '.')))
			.pipe(es.split(' '))
			.pipe(es.through(
				function write(line) {
					if(field === 1)
						modulus = +line;
					if(field === 2)
						this.emit('data', '-----BEGIN CERTIFICATE-----');
					if(field > 2)
						this.emit('data', '\n' + line);
					field++;
			}, 	function end() {
					this.emit('data', '-----END CERTIFICATE-----');
					this.emit('end');
			}))
			.pipe(ws);
	});
		
	ws.on('finish', function() {console.log('finish');
		callback(null, meta);
	});
	
	ws.on('error', function(err) {
		console.log(err);
		callback(err);
	});
}

function encryptMessage(meta, callback) {
	console.log('encrypt');
	var cmd = 'openssl smime -sign -in ' + meta.id + '.msg -signer my.pem -inkey my.key | ' +
			  'openssl smime -encrypt -out ' + meta.id + '.eml ' + meta.id + '.crt';
			  
	cp.exec(cmd, function(err, stdout, stderr) {
		if(err !== null) {
		  callback(err);
		  return;
		}
		cp.exec('echo ".\n" >> ' + meta.id + '.eml', function(er,sto,ste){
			callback(null,meta);
		});
	});
}

function sendMail(meta, callback) {
	cp.exec('sendmail -f ' + meta.from + ' -- ' + meta.to + ' < ' + meta.id + '.eml', function(err, stdout, stderr) {
		//if(err === null)
		   callback(err);
	});
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


