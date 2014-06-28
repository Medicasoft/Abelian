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

describe("trust anchor management", function () {
    this.timeout(300000);

    var anchor;
    before("load anchor from file", function (done) {
        utils.readAnchor(
            function (err, rAnchor) {
                expect(err).to.not.exist;
                anchor = rAnchor;
                done();
            },
            config.unitTestAnchorPath);
    });

    describe("#create - upload trust anchor for remote domain into a specific local domain", function () {

        it("should be able to create trust anchors", function (done) {
            aServer.addAnchor(done, aServer.domain, 'pbX.medicasoft.us', anchor);
           
        });

        after(function(done) {                
            aServer.removeAnchor(done, aServer.domain, 'pbX.medicasoft.us');
        });
    });


    describe("#list", function () {
        it("should be able to get all trust anchors", function (done) {
            aServer.listAnchors(done);
        });
    });



    describe("#get", function () {
        before(function (doneB) {
            aServer.addAnchor(doneB, aServer.domain, 'pbXY.medicasoft.us', anchor);
        });

        it("should be able to get an individual trust anchor", function (done) {           
            aServer.findAnchor(done, aServer.domain, 'pbX.medicasoft.us');
        });
        
        after(function (doneA) {
            aServer.removeAnchor(doneA, aServer.domain, 'pbXY.medicasoft.us');
        });
    });


    describe("#delete", function () {
        before(function (done) {
            aServer.addAnchor(done, aServer.domain, 'pbXZ.medicasoft.us', anchor);
        });

        it("should be able to remove trust anchors for local domain", function (done) {            
            aServer.removeAnchor(done, aServer.domain, 'pbXZ.medicasoft.us');
        });

    });
});