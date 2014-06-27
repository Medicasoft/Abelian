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

describe("trust anchor management", function () {
    this.timeout(300000);

    describe("#create - upload trust anchor for remote domain into a specific local domain", function () {

        it("should be able to create trust anchors", function (done) {
            aServer.addAnchor(done, aServer.domain, 'pbX.medicasoft.us', '-----BEGIN CERTIFICATE-----\nMIIDETCCAfmgAwIBAgIJAKGnZIP26pmZMA0GCSqGSIb3DQEBCwUAMB8xHTAbBgNV\nBAMMFHBiMi5tZWRpY2Fzb2Z0LnVzX2NhMB4XDTE0MDYyNDEzMTUzN1oXDTE1MDYy\nNDEzMTUzN1owHzEdMBsGA1UEAwwUcGIyLm1lZGljYXNvZnQudXNfY2EwggEiMA0G\nCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCdkItcynVjwDt0KfIrZZvpt3ObfYZs\nDk48fn+SeaNrarLiV98bLiOvlNlvo6RMii3g7aOgXFw6R4ewLrCej/O4sioAYSCQ\nEf9mwuNg5L/74HuHYI5Nn0qIt2D5M9Kqm6sp+gA4sfc3eSASsFmSTyAXkheRIiWc\nrTI9VEBDDTrA/R8PLKRGhDkt5WyzvZSZLYpG/u8Xs2v3flO5PTkixy1YFzBrqgRd\nwcm7V24B4ULmpxOmPSLt0O0+qDiGYVPL5NNMeiLw5a3vZ54ZMkmhyYLiIgS1yUQS\nTKR6+f64WmZ58apynjCiyxi10N1hnokfeJgh/hC5Bse1kL9zlq7uAEdtAgMBAAGj\nUDBOMB0GA1UdDgQWBBRWHIVnwiZVqAi/kZmfbSQwlzd4HjAfBgNVHSMEGDAWgBRW\nHIVnwiZVqAi/kZmfbSQwlzd4HjAMBgNVHRMEBTADAQH/MA0GCSqGSIb3DQEBCwUA\nA4IBAQA28LLpU9YYknu5fRtxrG8sibw1s+Zcr1eeidrnQXRC7i4ul7rGBFcYBH1w\nxeVr/mivdbJgUafUjCXNJ8Ffj+DeSD2Yez3qaukTjBDnOSYy+G0Ux47kbkhVlm/i\nMuayJdDROlvlURUIWNAhiOnx/mYp5jZjoTqRfaa+/vMeZwM9hn2zWv0NhuTlXrvu\nHFGX+bGb9hMqy39GxH/mBSrb8vTGcqb8bjoef68gjCcUtn8vI4vZbtkwdUCUrEv4\nhDZ0/pBlzTe4cer7nizSjZzajfIRlKZAIr3vFktt9dBheBTrus1x1Qy1clG8KJ3X\nOly+BI52gN/hhDMW8yQNnzP5UxNZ\n-----END CERTIFICATE-----\n');
           
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
            aServer.addAnchor(doneB, aServer.domain, 'pbXY.medicasoft.us', '-----BEGIN CERTIFICATE-----\nMIIDETCCAfmgAwIBAgIJAKGnZIP26pmZMA0GCSqGSIb3DQEBCwUAMB8xHTAbBgNV\nBAMMFHBiMi5tZWRpY2Fzb2Z0LnVzX2NhMB4XDTE0MDYyNDEzMTUzN1oXDTE1MDYy\nNDEzMTUzN1owHzEdMBsGA1UEAwwUcGIyLm1lZGljYXNvZnQudXNfY2EwggEiMA0G\nCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCdkItcynVjwDt0KfIrZZvpt3ObfYZs\nDk48fn+SeaNrarLiV98bLiOvlNlvo6RMii3g7aOgXFw6R4ewLrCej/O4sioAYSCQ\nEf9mwuNg5L/74HuHYI5Nn0qIt2D5M9Kqm6sp+gA4sfc3eSASsFmSTyAXkheRIiWc\nrTI9VEBDDTrA/R8PLKRGhDkt5WyzvZSZLYpG/u8Xs2v3flO5PTkixy1YFzBrqgRd\nwcm7V24B4ULmpxOmPSLt0O0+qDiGYVPL5NNMeiLw5a3vZ54ZMkmhyYLiIgS1yUQS\nTKR6+f64WmZ58apynjCiyxi10N1hnokfeJgh/hC5Bse1kL9zlq7uAEdtAgMBAAGj\nUDBOMB0GA1UdDgQWBBRWHIVnwiZVqAi/kZmfbSQwlzd4HjAfBgNVHSMEGDAWgBRW\nHIVnwiZVqAi/kZmfbSQwlzd4HjAMBgNVHRMEBTADAQH/MA0GCSqGSIb3DQEBCwUA\nA4IBAQA28LLpU9YYknu5fRtxrG8sibw1s+Zcr1eeidrnQXRC7i4ul7rGBFcYBH1w\nxeVr/mivdbJgUafUjCXNJ8Ffj+DeSD2Yez3qaukTjBDnOSYy+G0Ux47kbkhVlm/i\nMuayJdDROlvlURUIWNAhiOnx/mYp5jZjoTqRfaa+/vMeZwM9hn2zWv0NhuTlXrvu\nHFGX+bGb9hMqy39GxH/mBSrb8vTGcqb8bjoef68gjCcUtn8vI4vZbtkwdUCUrEv4\nhDZ0/pBlzTe4cer7nizSjZzajfIRlKZAIr3vFktt9dBheBTrus1x1Qy1clG8KJ3X\nOly+BI52gN/hhDMW8yQNnzP5UxNZ\n-----END CERTIFICATE-----\n');
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
            aServer.addAnchor(done, aServer.domain, 'pbXZ.medicasoft.us', '-----BEGIN CERTIFICATE-----\nMIIDETCCAfmgAwIBAgIJAKGnZIP26pmZMA0GCSqGSIb3DQEBCwUAMB8xHTAbBgNV\nBAMMFHBiMi5tZWRpY2Fzb2Z0LnVzX2NhMB4XDTE0MDYyNDEzMTUzN1oXDTE1MDYy\nNDEzMTUzN1owHzEdMBsGA1UEAwwUcGIyLm1lZGljYXNvZnQudXNfY2EwggEiMA0G\nCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCdkItcynVjwDt0KfIrZZvpt3ObfYZs\nDk48fn+SeaNrarLiV98bLiOvlNlvo6RMii3g7aOgXFw6R4ewLrCej/O4sioAYSCQ\nEf9mwuNg5L/74HuHYI5Nn0qIt2D5M9Kqm6sp+gA4sfc3eSASsFmSTyAXkheRIiWc\nrTI9VEBDDTrA/R8PLKRGhDkt5WyzvZSZLYpG/u8Xs2v3flO5PTkixy1YFzBrqgRd\nwcm7V24B4ULmpxOmPSLt0O0+qDiGYVPL5NNMeiLw5a3vZ54ZMkmhyYLiIgS1yUQS\nTKR6+f64WmZ58apynjCiyxi10N1hnokfeJgh/hC5Bse1kL9zlq7uAEdtAgMBAAGj\nUDBOMB0GA1UdDgQWBBRWHIVnwiZVqAi/kZmfbSQwlzd4HjAfBgNVHSMEGDAWgBRW\nHIVnwiZVqAi/kZmfbSQwlzd4HjAMBgNVHRMEBTADAQH/MA0GCSqGSIb3DQEBCwUA\nA4IBAQA28LLpU9YYknu5fRtxrG8sibw1s+Zcr1eeidrnQXRC7i4ul7rGBFcYBH1w\nxeVr/mivdbJgUafUjCXNJ8Ffj+DeSD2Yez3qaukTjBDnOSYy+G0Ux47kbkhVlm/i\nMuayJdDROlvlURUIWNAhiOnx/mYp5jZjoTqRfaa+/vMeZwM9hn2zWv0NhuTlXrvu\nHFGX+bGb9hMqy39GxH/mBSrb8vTGcqb8bjoef68gjCcUtn8vI4vZbtkwdUCUrEv4\nhDZ0/pBlzTe4cer7nizSjZzajfIRlKZAIr3vFktt9dBheBTrus1x1Qy1clG8KJ3X\nOly+BI52gN/hhDMW8yQNnzP5UxNZ\n-----END CERTIFICATE-----\n');
        });

        it("should be able to remove trust anchors for local domain", function (done) {            
            aServer.removeAnchor(done, aServer.domain, 'pbXZ.medicasoft.us');
        });

    });
});