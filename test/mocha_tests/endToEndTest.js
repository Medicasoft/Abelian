var chai = require("chai");
var expect = require("chai").expect;
var request = require("request");
var async = require("async");
var fs = require("fs");
var directserver = require('./lib/directserver');
var mh = require("./lib/mailbbtestcase");
var utils = require("./lib/utils");

chai.config.includeStack = true;

var anchorPath = './abelian-test-resources/';

var aServer = new directserver.DirectServer("75.101.217.208", "abelian.medicasoft.us", 8085, "abelian.medicasoft.us"); 
var bServer = new directserver.DirectServer("54.198.224.233", "pb2.medicasoft.us", 8085, "pb2.medicasoft.us" , anchorPath + 'pb2_root.pem');
//var aServer = new directserver.DirectServer("54.82.194.32", "pb4.medicasoft.us", 8085, "pb4.medicasoft.us");

var aUser1 = "maria@abelian.medicasoft.us";
var aUserInvalid = "invalidUser@abelian.medicasoft.us";
var bUser1 = "catalin@pb2.medicasoft.us";
//var aUser1 = "maria@pb4.medicasoft.us";

var aAnchorPath = anchorPath + 'abelian_root.pem';
var bAnchorPath = anchorPath + 'pb2_root.pem';

describe("Abelian", function () {
    this.timeout(300000);
    


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
                    readAnchor(cb, aAnchorPath);
                },
                //upload aDomain1 anchor to B
                function (anchor, cb) {
                    bServer.addAnchor(cb, bServer.domain, aServer.domain, anchor);
                },                
                //get bDomain1 anchor from B   
                function (result, cb) {
                    readAnchor(cb, bAnchorPath);
                },
                //upload bDomain1 anchor to A
                function (anchor, cb) {
                    aServer.addAnchor(cb, aServer.domain, bServer.domain, anchor);
                }
            ], function(err, result){ done(err); });
        });

        it("should be able to send Direct mail from server B to server A", function (done) {
            mh.run(done, bServer, aServer, generateEmail(bUser1, aUser1, aServer), 'complete');
        });

        it("should be able to send Direct mail between two different Abelian servers: A -> B", function (done) {
             mh.run(done, aServer, bServer, generateEmail(aUser1, bUser1, aServer), 'complete'); 
             //send mail from A to B
             //expect B has the sent message in messages list
             //expect A receive successful MDN from B (possible with delay)
        });

    });
    
//    describe("End to end test with invalid recipient/sender addresses (with mutually trusted recipient and sender domains)", function () {
//        it("should raise error when recipient address doesn't exist on recipient server", function (done) {            
//            mh.run(done, aServer, aServer, generateEmail(aUser1, aUserInvalid, aServer), 'rejected'); //TODO check expected status
//        });
        
//        it("should raise error when sender address doesn't exist on sender server", function (done) {     
//            mh.run(done, aServer, aServer, generateEmail(aUserInvalid, aUser1, aServer), 'rejected');
//        });
//    });

////    describe("End to end test when recipient domain is untrusted", function () {
////        before("remove trust anchor B from server A", function (done) {
////             done();           
////        });
////        it("should raise error when trying to send mail from A to B (when B is not trusted by A)", function (done) {
////            done();
////        });
////    });
    
    //describe("End to end test when sender domain is untrusted by recipient", function () {
    //    before("ensure A (sender) has trust anchor for B (recipient), but B (recipient) doesn't have trust anchor for A (sender)", function (done){
    //         done();           
    //    });
    //    it("should raise error when trying to send/receive mail from A to B (when A is not trusted by B)", function (done) {
    //        done();
    //    });
    //});

//    describe("End to end test within same server", function () {

//        it("should be able to send Direct mail within same local domain", function (done) {
//            async.waterfall([
//                function (callback) { mh.run(callback, aServer, aServer, generateEmail(aUser1, aUser1, aServer), 'complete'); },
//            ], function (err, result) { done(err); });
//        });
//    });
});

function readAnchor(cb, path) {    
    fs.readFile(path, {encoding: "UTF-8" }, function(err, data) {							
        if(err)
            cb(err);
        else
            cb(null, data);
    });
}

function getAnchorPath(host) {
    //return ansibleRunPath + "/certificates/" + host + "/var/spool/direct/ca/ca.pem";
    return anchorPath + host + '_root.pem';

}

function generateEmail(from, to, server) {
    return {
        actual: {
            from: from,
            to: to,
            subject: "Test Message " + Date.now(),
            body: "Here goes the message body",
            "message-id": Date.now() + "@" + server.domain,
            date: "Fri, 27 Jun 2014 14:03:22 +0300" //new Date().toJSON() 
        },
        //attachment: "/Work/nodespace/directtest/resource/sample.txt"
    };
}
