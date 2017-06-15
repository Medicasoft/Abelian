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

var chai = require("chai");
var expect = require("chai").expect;
var request = require("request");
var async = require("async");
var fs = require("fs");
var directserver = require('./lib/directserver');
var mh = require("./lib/mailbbtestcase");
var utils = require("./lib/utils");
var config = require("./config");

var d1='d1@domain1.dcdt30prod.sitenv.org';
var d2='d2@domain1.dcdt30prod.sitenv.org';
var d3='d3@domain2.dcdt30prod.sitenv.org';
var d4='d4@domain2.dcdt30prod.sitenv.org';
var d5='d5@domain1.dcdt30prod.sitenv.org';
var d6='d6@domain4.dcdt30prod.sitenv.org';
var d7='d7@domain2.dcdt30prod.sitenv.org';
var d8='d8@domain5.dcdt30prod.sitenv.org';
var d9='d9@domain1.dcdt30prod.sitenv.org';
var d10='d10@domain3.dcdt30prod.sitenv.org';
var d11='d11@domain6.dcdt30prod.sitenv.org';
var d12='d12@domain7.dcdt30prod.sitenv.org';
var d13='d13@domain8.dcdt30prod.sitenv.org';
var d14='d14@domain1.dcdt30prod.sitenv.org';
var d15='d15@domain2.dcdt30prod.sitenv.org';
var d16='d16@domain5.dcdt30prod.sitenv.org';


chai.config.includeStack = true;

var aServer = new directserver.DirectServer(config.aServerHost, config.aServerServiceUrl, config.aServerServicePort, config.aServerDomain);
var bServer = new directserver.DirectServer(config.bServerHost, config.bServerServiceUrl, config.bServerServicePort, config.bServerDomain);

var aUser1 = config.aUser1;
var aUserInvalid = config.aUserInvalid;
var bUser1 = config.bUser1;


describe("Abelian", function () {
    this.timeout(300000);
    
    // before("fresh setup", function (done) {
        // utils.logMessage("fresh setup");
        // async.series([
               // function (cb) { aServer.deleteAllAnchors(cb); },
               // function (cb) { aServer.deleteAllMessages(cb); },
               // function (cb) { bServer.deleteAllAnchors(cb); },
               // function (cb) { bServer.deleteAllMessages(cb); },
        // ], done);
    // });


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
                //check whether the A anchor exists on B server
                function (anchor, cb) {
                    bServer.findAnchor(cb, bServer.domain, aServer.domain);
                },
                function (anchor, cb) {
                    if (anchor == null) {
                        async.waterfall([
                            function (cb2) { utils.readAnchor(cb2, config.aAnchorPath); },
                             //upload aDomain1 anchor to B
                            function (anchor, cb2) { bServer.addAnchor(cb2, bServer.domain, aServer.domain, anchor); }
                        ], cb);
                    }
                    else
                        cb(null, null);
                },
                //check whether the B anchor exists on A server    
                function (anchor, cb) {
                    aServer.findAnchor(cb, aServer.domain, bServer.domain);
                },
                function (anchor, cb) {
                    if (anchor == null) {
                        async.waterfall([
                            function (cb2) { utils.readAnchor(cb2, config.bAnchorPath); },
                             //upload B anchor to A
                            function (anchor, cb2) { aServer.addAnchor(cb2, aServer.domain, bServer.domain, anchor); }
                        ], cb);
                    }
                    else
                        cb(null, null);
                },
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
            var message = utils.generateMessage(generateEmail(aUser1, d5, aServer));
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
            var message = utils.generateMessage(generateEmail(aUser1, d6, aServer));
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
            var message = utils.generateMessage(generateEmail(aUser1, d7, aServer));
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
            var message = utils.generateMessage(generateEmail(aUser1, d8, aServer));
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
            var message = utils.generateMessage(generateEmail(aUser1, d9, aServer));
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
            var message = utils.generateMessage(generateEmail(aUser1, d10, aServer));
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
            var message = utils.generateMessage(generateEmail(aUser1, d11, aServer));
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
            var message = utils.generateMessage(generateEmail(aUser1, d12, aServer));
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
            var message = utils.generateMessage(generateEmail(aUser1, d13, aServer));
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
            var message = utils.generateMessage(generateEmail(aUser1, d14, aServer));
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
            var message = utils.generateMessage(generateEmail(aUser1, d15, aServer));
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
            var message = utils.generateMessage(generateEmail(aUser1, d16, aServer));
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


    // describe("Test remove anchor from server", function () {
        // it("should not hang/error on remove anchor when no anchors exist", function (done) {
            // async.series([
               // function (cb) { aServer.deleteAllAnchors(cb); },
               // function (cb) { aServer.removeAnchor(cb, aServer.domain, bServer.domain); },
               // function (cb) { aServer.removeAnchor(cb, aServer.domain, bServer.domain); }
            // ], done);
        // });
    // });

    // describe("Test remove messages from server", function () {
        // it("should not find messages after removing all messages", function (done) {
            // async.series([
               // function (cb) { aServer.deleteAllMessages(cb); },
               // function (cb) { aServer.listMessages(function (err, res) { expect(err).to.not.exist; expect(res.totalResults).to.be.empty; cb(null); }); },
            // ], done);
        // });
    // });
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
