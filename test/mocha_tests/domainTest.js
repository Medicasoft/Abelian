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
var config = require("./config");

chai.config.includeStack = true;

var baseUrl = config.unitTestBaseUrl;
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
                    }
                }

                done();
            });
        });
    });
    
    describe("#create", function () {
        var id;
               
        
        it("should create a new domain, get it and compare", function (done) {
            createDomain(function (tDomain, tId) {
                var domain = tDomain; id = tId; 
                //get
                request({
                    uri: domainUrl + '/' + id,
                    method: "GET"
                }, function (err, resp, body) {
                    expect(err).to.not.exist;
                    expect(resp.statusCode).to.equal(200, 'HTTP Body: ' + JSON.stringify(body));
                    var actualJson = JSON.parse(resp.body);
                    expect(actualJson.name).to.equal(domain.name);
                    expect(actualJson.is_local).to.equal(domain.is_local);
                    done();
                });
            });
            
           
        });
        
        it("should reject domain creation when certificate discovery is local and no certificate was provided", function (done) {
             var domain = {
              "name": "testC.domain.us",      
              "crl_path": "mr_crl",
              "cert_disco_algo": 'local',
              "is_local" : true,
              "active" : true
            };
            //post
            request({
                uri: domainUrl,
                method: "POST",
                json: domain
            }, function (err, resp, body) {
                expect(err).to.not.exist;
                expect(resp.statusCode).to.equal(400, 'HTTP Body: ' + JSON.stringify(body));
                expect(body).to.equal("crypt_cert required for local algorithm");
                done();            
            });
        });
        
        it("should reject domain creation when certificate discovery is local and NULL certificate was provided", function (done) {
             var domain = {
              "name": "testC.domain.us",      
              "crl_path": "mr_crl",
              "crypt_cert" : null,
              "cert_disco_algo": 'local',
              "is_local" : true,
              "active" : true
            };
            //post
            request({
                uri: domainUrl,
                method: "POST",
                json: domain
            }, function (err, resp, body) {
                expect(err).to.not.exist;
                expect(resp.statusCode).to.equal(400, 'HTTP Body: ' + JSON.stringify(body));
                expect(body).to.equal("crypt_cert required for local algorithm");
                done();            
            });
        });
        
        after(function (done) {
            //delete
            request({
                uri: domainUrl + '/' + id,
                method: "DELETE"
            }, function (err, resp, body) {
                expect(err).to.not.exist;
                expect(resp.statusCode).to.equal(204, 'HTTP Body: ' + JSON.stringify(body));
                done();
            });
        });
       
    });
    
    

    describe("#update, #get, #delete", function () {        
        var domain, id;
        
        before("creates domain", function (done) {
            createDomain(function (tDomain, tId) {
                domain = tDomain; id = tId; 
                done();
            });
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
                expect(actualJson.name).to.equal(domain.name);
                expect(actualJson.is_local).to.equal(domain.is_local);
                done();
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
      "name": "test.domain.us",      
      "crl_path": "mr_crl",
      "crypt_cert": null,
      "cert_disco_algo": 'hybrid',
      "is_local" : true,
      "active" : true
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

