/**
 * This implements the basic infrastructure to sending/receiving e-mails.
 * It is mainly designed to test communication between two HISP's but any 
 * two email servers should do.  It is assumed that the receiving HISP
 * always sends back an MDN/DSN.
 * 
 * Logic:
 *   1) Send email from one server to the other with email client.
 *   2) Using POP3 client poll both servers until
 *     a) Sending server has undelivered message
 *     b) Receiving server has the original message and sending server
 *        has MDN
 *        
 * Emits 'error' or 'end'
 */

var events = require("events");
var mailparser = require("mailparser");
var async = require("async");
var utils = require("./utils");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Dunno this is needed.  Otherwise send email does not work.
	
var emitter = null;
//exports.emitter = emitter;
var EmitKey = Object.create(null);
EmitKey.ERROR = 'error';
EmitKey.END = 'end';

var Status = Object.create(null);
Status.NEW = 'new';
Status.ERROR = 'error';
Status.SENT = 'sent';
Status.REJECTED = 'rejected';
Status.INCOMPLETE = 'incomplete';
Status.COMPLETED = 'complete';

var RETRY_EMAIL_DELAY = 2000;
var INITIAL_RECEIVE_EMAIL_DELAY = 3000;
var MAX_RECEIVE_EMAIL_TRIES =  30; //30
var RESPECT_MDN = true;

var TestResult = function(sendingIP, receivingIP, subject, messageId) {
	this.sendingIP = sendingIP;
	this.receivingIP = receivingIP;
	this.subject = subject;
	this.messageId = messageId;
	
	this.status = Status.NEW;
	
	this.err = null;
	this.emailFromSending = null;
	this.emailFromReceiving = null;
};

TestResult.prototype.setError = function(err) {
	this.status = Status.ERROR;
	this.err = err;
	emitter.emit(EmitKey.ERROR, err);
};

TestResult.prototype.setEmailSent = function() {
	this.status = Status.SENT;
};

TestResult.prototype._actOnIP = function(ip, sendingAction, receivingAction, noneAction) {
	if (ip === this.sendingIP) {
		return sendingAction();
	} else if (ip === this.receivingIP) {
		return receivingAction();
	} else {
		return noneAction();
	}
};

TestResult.prototype._setReceivedEmailFromSending = function(email) {
	this.emailFromSending = email;
	if (email.subject.indexOf('Undeliverable') > -1) {
		this.status = Status.REJECTED;
		emitter.emit('end', this);
	} else if (this.sendingIP === this.receivingIP) {
		this.status = Status.COMPLETED;
		emitter.emit(EmitKey.END, this);
	} else {
	    if (this.emailFromReceiving !== null) {
	        utils.logMessage("... the MDN was successfully received on sender server! <<<<<<<<<<<<<<<<<<<<<<< ");
			this.status = Status.COMPLETED;
			emitter.emit(EmitKey.END, this);
		} else {
			this.status = Status.INCOMPLETE;
		}
	}
};

TestResult.prototype._setReceivedEmailFromReceiving = function(email) {
	this.emailFromReceiving = email;
	if (this.emailFromSending !== null) {
		this.status = Status.COMPLETED;
		emitter.emit(EmitKey.END, this);
	} else {
	    utils.logMessage("... the actual message was successfully received on recipient server! <<<<<<<<<<<<<<<<<<<<<<< ");
	    if (RESPECT_MDN) {
	        utils.logMessage("... now waiting for MDN");	        
			this.status = Status.INCOMPLETE;
		} else {
	        this.status = Status.COMPLETED;
	        utils.logMessage("... completed, not waiting for MDN");
			emitter.emit(EmitKey.END, this);
		}
	}
};

TestResult.prototype.setReceivedEmail = function(ip, email) {

    
    
	//utils.logMessage("[%s] ...received email", ip);
	var that = this;
	return this._actOnIP(ip,
		function () { // for ip == sending ip (searching for MDN message)
		    if (email.headers["content-type"] !== undefined && email.headers["content-type"].indexOf('report-type="disposition-notification"') != -1) { //is MDN
		        if (email.attachments.length >= 2) {
		            var content = email.attachments[1].content.toString();
		            var match = /Original-Message-ID:\s(.*)\s/.exec(content);
		            if (match) {
		                var origMsgId = match[1];
		                //emailOriginalMessageId
		                utils.logMessage("[%s] ...compare actual original email id " + origMsgId + " to expected id ..." + that.messageId, ip);
		                if (origMsgId !== undefined && origMsgId === that.messageId) {
		                    utils.logMessage("...MATCH FOUND... <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<< ");
		                    utils.logMessage("...processing received from sending");
		                    that._setReceivedEmailFromSending(email);
		                    return true;
		                }
		            }


		        }
		    }
		    return false;
		},
		function () { // for ip == receiving ip (searching for actual message)
		    var emailMessageId = email.messageId;                
		    utils.logMessage("[%s] ...compare actual email id " + emailMessageId + " to expected id ..." + that.messageId, ip);
		    if (emailMessageId === that.messageId) {
		        utils.logMessage("...MATCH FOUND... <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<< ");
		        utils.logMessage("...processing received from receiving");
		        that._setReceivedEmailFromReceiving(email);
		        return true;
		    }
		    return false;
		},
		function () {
			return false;
		});
};

TestResult.prototype.hasError =  function() {
	return this.status === Status.ERROR;
};

TestResult.prototype.isComplete = function() {
	return this.hasError() || (this.status === Status.REJECTED) || (this.status === Status.COMPLETE);
};

TestResult.prototype.hasEmail = function(ip) {
	var that = this;
	return this._actOnIP(ip,
			function() { //if sending ip, has email when (the MDN has arrived) or (the actual mail was received and MDN is ignored)
				return that.emailFromSending !== null || (that.emailFromReceiving !== null && ! RESPECT_MDN);
			},
			function() { //if receiving ip, has email when MDN has arrived
				return that.emailFromReceiving !== null;
			},
			function() {
				that.setError(new Error("internal bug assertion: unrecognized server"));
				return false;
			});
};

var receive = function receive(server, result, tryCount, onSuccess) {
    //for each message  (async.each)
            //get message
            //parse
            //handleParsedEmail (compare message-id, set result and emit end)
            
	utils.logMessage('[%s] ' + "... started receiving from " , server.host);
	    
	var totalmsgcount = 0;
	var currentmsgindex = 0;
	var currentmsgnumber = 0;
	    
    //TODO take paging into account OR use REST API to get by message-id (?)
    server.listMessages(function(err, body){        
        utils.logMessage('[%s] ' + "receive...list..." , server.host);
        totalmsgcount = body.totalResults;
        if (err) {
            result.setError(new Error('error', "receive error on list: " + err));
			//callback(err)            
        } else {
            utils.logMessage('[%s] ' + "receive...list..." + "...count..." + totalmsgcount, server.host);
            body.entry = body.entry.reverse(); //we know that the most recent messages are at the end of the list
            async.each(body.entry, function(entry, callback){
                async.waterfall([
                    function(cb) { server.getMessage(cb, entry.id); },
                    function(msg, cb) {
                        utils.logMessage('[%s] ' + "receive...retr..." + entry.id + "..." , server.host);
                        if (! result.hasError()) {                            
                            var mailParser = new mailparser.MailParser();
                            
                            var handleParsedEmail = function (email) {
                                result.setReceivedEmail(server.host, email);
                                cb(null, result);
                            };
                            
                            mailParser.on("end", handleParsedEmail);
                            mailParser.write(msg);
                            mailParser.end();
                        } else {
                            cb(null, result); //another error already reported
                        }
                    }
                ], callback); //for each entry
            }, function (err) { //for all entries
                if (err) {
                    result.setError(err);
                    return;
                }
                //any error or no message found yet -> retry
                utils.logMessage('[%s] ' + "receive...messages processed..." + "..." + tryCount, server.host);
                
                if ((!result.hasEmail(server.host)) && (!result.isComplete())) {
                    tryCount += 1;
                    if (tryCount < MAX_RECEIVE_EMAIL_TRIES) {
                        setTimeout(function () { receive(server, result, tryCount, onSuccess); }, RETRY_EMAIL_DELAY);
                    } else {
                        result.setError(new Error("no response from receiving server"));
                    }
                }
                else 
                    if (onSuccess !== null) {                        
                        onSuccess();
                    }
            });
        }  
    });
	
};

var execute = function execute(sendingServer, receivingServer, email) {
    var subject = email.actual.subject;
    utils.logMessage("...sending e-mail:");
    utils.logMessage(subject);
	var result = new TestResult(sendingServer.host, receivingServer.host, subject, email.actual["message-id"]);
    
    var message = '';
    message += 'from: <' + email.actual.from + '>\n';
    message += 'to: <' + email.actual.to + '>\n';
    message += 'subject: ' + email.actual.subject + '\n';
    message += 'Date: ' + email.actual.date + '\n';
    message += 'Message-ID: ' + email.actual["message-id"] + '\n';
    message += '\n';
    message += email.actual.body;
    
    var cb = function(err, resp, body) {
        if(err) {
            utils.logMessage("send...error..." + sendingServer.host);
            result.setError(err);
            return;
        }
        utils.logMessage("send...end..." + sendingServer.host);
        result.setEmailSent();

        utils.logMessage("Waiting for %s seconds...", INITIAL_RECEIVE_EMAIL_DELAY / 1000);
        setTimeout(function () {
            var onSuccessfulReceive = null;
            if (sendingServer !== receivingServer) {
                onSuccessfulReceive = function () {
                    utils.logMessage("Successfully received the message, now waiting for MDN");
                    receive(sendingServer, result, 0, null);
                }
            }
            receive(receivingServer, result, 0, onSuccessfulReceive);           
        }, INITIAL_RECEIVE_EMAIL_DELAY);
    };
    
    utils.logMessage("[%s] send...message", sendingServer.host);
    sendingServer.sendMessage(cb, message);
};


exports.run = function (callback, sendingServer, receivingServer, email, expected) {
    emitter = new events.EventEmitter();
    emitter.on('error', function(err) {
        callback(err);
    });

    emitter.on('end', function(result) {
        if (result.status === expected) {
            callback(null);
        } else {
            callback(new Error('Unexpected result status (' + result.status + " vs " + expected + ')'));
        }
    });

    execute(sendingServer, receivingServer, email);
};