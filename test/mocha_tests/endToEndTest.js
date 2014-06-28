var chai = require("chai");
var expect = require("chai").expect;
var request = require("request");
var async = require("async");
var fs = require("fs");
var directserver = require('./lib/directserver');
var mh = require("./lib/mailbbtestcase");
var utils = require("./lib/utils");
var config = require("./config");

chai.config.includeStack = true;

var aServer = new directserver.DirectServer(config.aServerHost, config.aServerServiceUrl, config.aServerServicePort, config.aServerDomain);
var bServer = new directserver.DirectServer(config.bServerHost, config.bServerServiceUrl, config.bServerServicePort, config.bServerDomain);

var aUser1 = config.aUser1;
var aUserInvalid = config.aUserInvalid;
var bUser1 = config.bUser1;


describe("Abelian", function () {
    this.timeout(300000);
    
    describe("End to end negative test for sending A->B when recipient domain B doesn't trust domain A", function () {
        before("remove trust anchor B from server A", function (done) {
            async.series([
                function (cb) { aServer.removeAnchor(cb, aServer.domain, bServer.domain); }
            ], done);
        });
        it("should not be able to send message from A to B when recipient domain B doesn't trust domain A", function (done) {
            var cb = function (err, body) {
                if (err) {
                    utils.logMessage("send...error... as expected: " + err);
                    done(null);
                    return;
                }
                done(new Error("expected error on send"));
            };
            var message = utils.generateMessage(generateEmail(aUser1, bUser1, aServer));
            aServer.sendMessage(cb, message);

        });
    });

    describe("End to end test between mutually trusted server domains", function () {    
        
        before("setup anchors on both servers", function(done) {
            async.waterfall([   
                //check that the user exists on A
                function(cb) { 
                    aServer.getUser(cb, aServer.domain, aUser1);
                },
                //add user on A if doesn't exist
                function(user, cb) {  
                    user !== null ? cb(null, null) : aServer.addUser(cb, aServer.domain, aUser1); },
                //check that the user exists on B
                function (result, cb) {
                    bServer.getUser(cb, bServer.domain, bUser1);
                },
                //add user to local domain bDomain1 on B
                function (user, cb) {
                    user !== null ? cb(null, null) : bServer.addUser(cb, bServer.domain, bUser1);
                },            
                function (result, cb) {
                    utils.readAnchor(cb, config.aAnchorPath);
                },
                //upload aDomain1 anchor to B
                function (anchor, cb) {
                    bServer.addAnchor(cb, bServer.domain, aServer.domain, anchor);
                },                
                //get bDomain1 anchor from B   
                function (result, cb) {
                    utils.readAnchor(cb, config.bAnchorPath);
                },
                //upload bDomain1 anchor to A
                function (anchor, cb) {
                    aServer.addAnchor(cb, aServer.domain, bServer.domain, anchor);
                }
            ], function(err, result){ done(err); });
        });

        it("should be able to send Direct mail between two different Abelian servers: A -> B: " +
            "\n send mail from A to B " + 
            "\n expect B has the sent message in messages list " + 
            "\n expect A receive successful MDN from B (possible with delay)", function (done) {            
            mh.run(done, aServer, bServer, generateEmail(aUser1, bUser1, aServer), 'complete');
        });

        it("should be able to send Direct mail between two different Abelian servers: B -> A" +
            "\n send mail from A to B " +
            "\n expect B has the sent message in messages list " +
            "\n expect A receive successful MDN from B (possible with delay)", function (done) {
            mh.run(done, bServer, aServer, generateEmail(bUser1, aUser1, bServer), 'complete');
        });

    });
    
    describe("End to end negative test | certificate discovery", function () {
        it("should not send email when -> D5 Invalid address-bound certificate discovery in DNS", function (done) {
            var cb = function(err, body) {
                if(err) {
                    utils.logMessage("send...error... as expected: " + err);                    
                    done(null);
                    return;
                }
                done(new Error("expected error on send"));
            };
            var message = utils.generateMessage(generateEmail(aUser1, "d5@domain1.demo.direct-test.com", aServer));
            aServer.sendMessage(cb, message);
        });

        it("should not send email when -> D6 - Invalid domain-bound certificate discovery in DNS", function (done) {
            var cb = function (err, body) {
                if (err) {
                    utils.logMessage("send...error... as expected: " + err);
                    done(null);
                    return;
                }
                done(new Error("expected error on send"));
            };
            var message = utils.generateMessage(generateEmail(aUser1, "d6@domain4.demo.direct-test.com", aServer));
            aServer.sendMessage(cb, message);
        });

        it("should not send email when -> D7 - Invalid address-bound certificate discovery in LDAP", function (done) {
            var cb = function (err, body) {
                if (err) {
                    utils.logMessage("send...error... as expected: " + err);
                    done(null);
                    return;
                }
                done(new Error("expected error on send"));
            };
            var message = utils.generateMessage(generateEmail(aUser1, "d7@domain2.demo.direct-test.com", aServer));
            aServer.sendMessage(cb, message);
        });

        it("should not send email when -> D8 - Invalid domain-bound certificate discovery in LDAP", function (done) {
            var cb = function (err, body) {
                if (err) {
                    utils.logMessage("send...error... as expected: " + err);
                    done(null);
                    return;
                }
                done(new Error("expected error on send"));
            };
            var message = utils.generateMessage(generateEmail(aUser1, "d8@domain5.demo.direct-test.com", aServer));
            aServer.sendMessage(cb, message);
        });

        it("should not send email when -> D9 - Select valid address-bound certificate over invalid certificate in DNS", function (done) {
            var cb = function (err, body) {
                if (err) {
                    utils.logMessage("send...error... as expected: " + err);
                    done(null);
                    return;
                }
                done(new Error("expected error on send"));
            };
            var message = utils.generateMessage(generateEmail(aUser1, "d9@domain1.demo.direct-test.com", aServer));
            aServer.sendMessage(cb, message);
        });

        it("should not send email when -> D10 - Certificate discovery in LDAP with one unavailable LDAP serve", function (done) {
            var cb = function (err, body) {
                if (err) {
                    utils.logMessage("send...error... as expected: " + err);
                    done(null);
                    return;
                }
                done(new Error("expected error on send"));
            };
            var message = utils.generateMessage(generateEmail(aUser1, "d10@domain3.demo.direct-test.com", aServer));
            aServer.sendMessage(cb, message);
        });

        it("should not send email when -> D11 - No certificates discovered in DNS CERT records and no SRV records", function (done) {
            var cb = function (err, body) {
                if (err) {
                    utils.logMessage("send...error... as expected: " + err);
                    done(null);
                    return;
                }
                done(new Error("expected error on send"));
            };
            var message = utils.generateMessage(generateEmail(aUser1, "d11@domain6.demo.direct-test.com", aServer));
            aServer.sendMessage(cb, message);
        });

        it("should not send email when -> D12 - No certificates found in DNS CERT records and no available LDAP servers", function (done) {
            var cb = function (err, body) {
                if (err) {
                    utils.logMessage("send...error... as expected: " + err);
                    done(null);
                    return;
                }
                done(new Error("expected error on send"));
            };
            var message = utils.generateMessage(generateEmail(aUser1, "d12@domain7.demo.direct-test.com", aServer));
            aServer.sendMessage(cb, message);
        });

        it("should not send email when -> D13 - No certificates discovered in DNS CERT records or LDAP servers", function (done) {
            var cb = function (err, body) {
                if (err) {
                    utils.logMessage("send...error... as expected: " + err);
                    done(null);
                    return;
                }
                done(new Error("expected error on send"));
            };
            var message = utils.generateMessage(generateEmail(aUser1, "d13@domain8.demo.direct-test.com", aServer));
            aServer.sendMessage(cb, message);
        });

        it("should not send email when -> D14 - Discovery of certificate larger than 512 bytes in DNS", function (done) {
            var cb = function (err, body) {
                if (err) {
                    utils.logMessage("send...error... as expected: " + err);
                    done(null);
                    return;
                }
                done(new Error("expected error on send"));
            };
            var message = utils.generateMessage(generateEmail(aUser1, "d14@domain1.demo.direct-test.com", aServer));
            aServer.sendMessage(cb, message);
        });

        it("should not send email when -> D15 - Certificate discovery in LDAP based on SRV priority value", function (done) {
            var cb = function (err, body) {
                if (err) {
                    utils.logMessage("send...error... as expected: " + err);
                    done(null);
                    return;
                }
                done(new Error("expected error on send"));
            };
            var message = utils.generateMessage(generateEmail(aUser1, "d15@domain2.demo.direct-test.com", aServer));
            aServer.sendMessage(cb, message);
        });

        it("should not send email when -> D16 - Certificate discovery in LDAP based on SRV weight value", function (done) {
            var cb = function (err, body) {
                if (err) {
                    utils.logMessage("send...error... as expected: " + err);
                    done(null);
                    return;
                }
                done(new Error("expected error on send"));
            };
            var message = utils.generateMessage(generateEmail(aUser1, "d16@domain5.demo.direct-test.com", aServer));
            aServer.sendMessage(cb, message);
        });

        
    });


    describe("End to end test within same server", function () {

        it("should be able to send Direct mail within same local domain", function (done) {
            async.waterfall([
                function (callback) { mh.run(callback, aServer, aServer, generateEmail(aUser1, aUser1, aServer), 'complete'); },
            ], function (err, result) { done(err); });
        });
    });
});

function generateEmail(from, to, senderServer) {
    return {
        actual: {
            from: from,
            to: to,
            subject: "Test Message " + Date.now(),
            body: "Here goes the message body",
            "message-id": Date.now() + "@" + senderServer.domain,
            date: "Fri, 27 Jun 2014 14:03:22 +0300" //new Date().toJSON() 
        },
        //attachment: "/Work/nodespace/directtest/resource/sample.txt"
    };
}
