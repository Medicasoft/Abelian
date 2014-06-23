var chai = require("chai");
var expect = require("chai").expect;
var request = require("request");

chai.config.includeStack = true;

var baseUrl = "http://localhost:8085/";
var domainUrl = baseUrl + 'Domain';
var domainListUrl  = baseUrl + 'Domains';

describe("domain", function () {
    this.timeout(30000);

    describe("#list", function () {
        it("should list domains", function (done) {
            //get
            request({
                uri: domainListUrl,
                method: "GET"
            }, function (err, resp, body) {		
                expect(err).to.not.exist;
                expect(resp.statusCode).to.equal(200, 'HTTP Body: ' + JSON.stringify(body));
                var actualJson = JSON.parse(resp.body);
                expect(actualJson).to.have.property('totalResults');
                expect(actualJson).to.have.property('entry');
                if(actualJson.totalResults > 0) {
                    expect(actualJson.entry.length).to.equal(actualJson.totalResults);
                    for(var i in actualJson.entry) {
                        var entry = actualJson.entry[i];
                        expect(entry).to.have.property('id');
                        expect(entry.id.indexOf(domainUrl)).to.equal(0);					  
                        var id = entry.id.substring((domainUrl+'/').length);
                        expect(id).not.to.be.empty;

                        expect(entry).to.have.property('content');
                        expect(entry.content).to.have.property('name');
                        expect(entry.content).to.have.property('anchor_path');
                        expect(entry.content).to.have.property('crl_path');
                        expect(entry.content).to.have.property('crypt_cert');
                        expect(entry.content).to.have.property('cert_disco_algo');
  
                        expect(entry.content.name).not.to.be.empty;
                        expect(entry.content.cert_disco_algo).not.to.be.empty;
                    }
                }

                done();
            });
        });
    });

    

    describe("#create", function () {
        it("should create a new domain, get it and compare", function (done) {
            createDomain(function (domain, id) {
                //get
                request({
                    uri: domainUrl + '/' + id,
                    method: "GET"
                }, function (err, resp, body) {
                    expect(err).to.not.exist;
                    expect(resp.statusCode).to.equal(200, 'HTTP Body: ' + JSON.stringify(body));
                    var actualJson = JSON.parse(resp.body);
                    expect(actualJson).to.eql(domain);
                    done();
                });
            });
        });
    });

    describe("#update, #get, #delete", function () {
        var domain, id;
        before("create the domain to test", function (done) {            
            createDomain(function (tDomain, tId) { domain = tDomain; id = tId; done(); } );
        });
        it("should get the created domain", function (done) {
            //get
            request({
                uri: domainUrl + '/' + id,
                method: "GET"
            }, function (err, resp, body) {
                expect(err).to.not.exist;
                expect(resp.statusCode).to.equal(200, 'HTTP Body: ' + JSON.stringify(body));
                var actualJson = JSON.parse(resp.body);
                expect(actualJson).to.eql(domain);
                done();
            });
        });

        it("should update the domain, get it and compare", function (done) {
            var updatedDomain = {
              "name": "test2.infoworld.ro",
              "anchor_path": "my_anchor2",
              "crl_path": "mr_crl2",
              "crypt_cert": null,
              "cert_disco_algo": 3
            };
            //put
            request({
                uri: domainUrl + '/' + id,
                method: "PUT",
                json: updatedDomain
            }, function (err, resp, body) {
                expect(err).to.not.exist;
                expect(resp.statusCode).to.equal(200, 'HTTP Body: ' + JSON.stringify(body));

                //get
                request({
                    uri: domainUrl + '/' + id,
                    method: "GET"
                }, function (err, resp, body) {
                    expect(err).to.not.exist;
                    expect(resp.statusCode).to.equal(200, 'HTTP Body: ' + JSON.stringify(body));
                    var actualJson = JSON.parse(resp.body);
                    expect(actualJson).to.eql(updatedDomain);
                    done();
                });

            });
        });

        it("should delete the domain and get 404 if try to get the domain", function (done) {
            //delete
            request({
                uri: domainUrl + '/' + id,
                method: "DELETE"
            }, function (err, resp, body) {
                expect(err).to.not.exist;
                expect(resp.statusCode).to.equal(204, 'HTTP Body: ' + JSON.stringify(body));

                //get
                request({
                    uri: domainUrl + '/' + id,
                    method: "GET"
                }, function (err, resp, body) {
                    expect(err).to.not.exist;
                    expect(resp.statusCode).to.equal(404, 'HTTP Body: ' + JSON.stringify(body));
                    done();
                });
            });
        });
    });
});

function createDomain(cb) {
    var domain = {
      "name": "test.infoworld.ro",
      "anchor_path": "my_anchor",
      "crl_path": "mr_crl",
      "crypt_cert": null,
      "cert_disco_algo": 2
    };
    //post
    request({
        uri: domainUrl,
        method: "POST",
        json: domain
    }, function (err, resp, body) {
        expect(err).to.not.exist;
        expect(resp.statusCode).to.equal(201, 'HTTP Body: ' + JSON.stringify(body));
        expect(resp.headers.location.indexOf(domainUrl)).to.equal(0);

        var id = resp.headers.location.substring((domainUrl + '/').length); //global variable
        expect(id).not.to.be.empty;
        cb(domain, id);
    });
}

