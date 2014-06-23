var chai = require("chai");
var expect = require("chai").expect;
var request = require("request");

chai.config.includeStack = true;

var baseUrl = "http://localhost:8085/";
var userUrl = baseUrl + 'User';
var userListUrl  = baseUrl + 'Users';

describe("user", function () {
    this.timeout(30000);

    describe("#list", function () {
        it("should list users", function (done) {
            //get
            request({
                uri: userListUrl,
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
                        expect(entry.id.indexOf(userUrl)).to.equal(0);					  
                        var id = entry.id.substring((userUrl+'/').length);
                        expect(id).not.to.be.empty;

                        expect(entry).to.have.property('content');
                        expect(entry.content).to.have.property('address');
                        expect(entry.content.address).not.to.be.empty;
                    }
                }

                done();
            });
        });
    });

    

    describe("#create", function () {
        it("should create a new user, get it and compare", function (done) {
            createUser(function (user, id) {
                //get
                request({
                    uri: userUrl + '/' + id,
                    method: "GET"
                }, function (err, resp, body) {
                    expect(err).to.not.exist;
                    expect(resp.statusCode).to.equal(200, 'HTTP Body: ' + JSON.stringify(body));
                    var actualJson = JSON.parse(resp.body);
                    expect(actualJson).to.eql(user);
                    done();
                });
            });
        });
    });

    describe("#update, #get, #delete", function () {
        var user, id;
        before("create the user to test", function (done) {            
            createUser(function (tUser, tId) { user = tUser; id = tId; done(); } );
        });
        it("should get the created user", function (done) {
            //get
            request({
                uri: userUrl + '/' + id,
                method: "GET"
            }, function (err, resp, body) {
                expect(err).to.not.exist;
                expect(resp.statusCode).to.equal(200, 'HTTP Body: ' + JSON.stringify(body));
                var actualJson = JSON.parse(resp.body);
                expect(actualJson).to.eql(user);
                done();
            });
        });

        it("should update the user, get it and compare", function (done) {
            var updatedUser = {
                "address": "b@b.b",
                "certificate": null
            };
            //put
            request({
                uri: userUrl + '/' + id,
                method: "PUT",
                json: updatedUser
            }, function (err, resp, body) {
                expect(err).to.not.exist;
                expect(resp.statusCode).to.equal(200, 'HTTP Body: ' + JSON.stringify(body));

                //get
                request({
                    uri: userUrl + '/' + id,
                    method: "GET"
                }, function (err, resp, body) {
                    expect(err).to.not.exist;
                    expect(resp.statusCode).to.equal(200, 'HTTP Body: ' + JSON.stringify(body));
                    var actualJson = JSON.parse(resp.body);
                    expect(actualJson).to.eql(updatedUser);
                    done();
                });

            });
        });

        it("should delete the user and get 404 if try to get the user", function (done) {
            //delete
            request({
                uri: userUrl + '/' + id,
                method: "DELETE"
            }, function (err, resp, body) {
                expect(err).to.not.exist;
                expect(resp.statusCode).to.equal(204, 'HTTP Body: ' + JSON.stringify(body));

                //get
                request({
                    uri: userUrl + '/' + id,
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

function createUser(cb) {
    var user = {
        "address": "t@t.t",
        "certificate": null
    };
    //post
    request({
        uri: userUrl,
        method: "POST",
        json: user
    }, function (err, resp, body) {
        expect(err).to.not.exist;
        expect(resp.statusCode).to.equal(201, 'HTTP Body: ' + JSON.stringify(body));
        expect(resp.headers.location.indexOf(userUrl)).to.equal(0);

        var id = resp.headers.location.substring((userUrl + '/').length); //global variable
        expect(id).not.to.be.empty;
        cb(user, id);
    });
}

