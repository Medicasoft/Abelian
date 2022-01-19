var fs = require('fs');
var expect = require('chai').expect;

var proxyquire = require(fs.realpathSync('./node_modules/proxyquire'));

describe("mustSendDispatchedFilter", function() {
    it('should handle config key missing', function() {
        var mustSendDispatchedFilter = proxyquire(fs.realpathSync('./smtp/mustSendDispatchedFilter.js'), {
            '../config.js': {
                // localDomainsToSendDispatchedFor: []
            }
        });
        var testResult = mustSendDispatchedFilter.check('x@y.z');
        expect(testResult).to.be.false;
    });

    it('should handle config key empty array', function() {
        var mustSendDispatchedFilter = proxyquire(fs.realpathSync('./smtp/mustSendDispatchedFilter.js'), {
            '../config.js': {
                localDomainsToSendDispatchedFor: []
            }
        });
        var testResult = mustSendDispatchedFilter.check('x@y.z');
        expect(testResult).to.be.false;
    });

    it('should match address in list with one item', function() {
        var mustSendDispatchedFilter = proxyquire(fs.realpathSync('./smtp/mustSendDispatchedFilter.js'), {
            '../config.js': {
                localDomainsToSendDispatchedFor: ['direct.medicasoft.us']
            }
        });
        expect(mustSendDispatchedFilter.check('xyz@direct.medicasoft.us')).to.be.true;
        expect(mustSendDispatchedFilter.check('xyz@google.us')).to.be.false;
        expect(mustSendDispatchedFilter.check('xyz@direct.medicasoft.us.something.here')).to.be.false;
    });

    it('should match address in list with multiple items', function() {
        var mustSendDispatchedFilter = proxyquire(fs.realpathSync('./smtp/mustSendDispatchedFilter.js'), {
            '../config.js': {
                localDomainsToSendDispatchedFor: ['direct.medicasoft.us', 'test.med.us']
            }
        });
        expect(mustSendDispatchedFilter.check('something@test.med.us')).to.be.true;
        expect(mustSendDispatchedFilter.check('xyz@direct.medicasoft.us')).to.be.true;
        expect(mustSendDispatchedFilter.check('xyz@google.us')).to.be.false;
        expect(mustSendDispatchedFilter.check('xyz@direct.medicasoft.us.something.here')).to.be.false;
    });
});