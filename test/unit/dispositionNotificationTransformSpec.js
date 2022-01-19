var fs = require('fs');
var expect = require('chai').expect;
var logger = require('../testLogger.js');
var proxyquire = require(fs.realpathSync('./node_modules/proxyquire'));

describe("dispositionNotificationTransform", function() {
    it('should add disposition-notification-to before from', function() {
        var dispositionNotificationTransform = proxyquire(fs.realpathSync('./smtp/dispositionNotificationTransform.js'), {
            '../config.js': {
                // localDomainsToSendDispatchedFor: []
            }
        });
        var content = fs.readFileSync('./test/fixtures/fromUs_message_no_disposition.txt', {encoding: 'utf8'});
        var expectedContent = fs.readFileSync('./test/fixtures/fromUs_message_no_disposition_fixed.txt', {encoding: 'utf8'});
        var actualContent = dispositionNotificationTransform.doTransform(content, 'medicasofttest@direct.medicasoft.us', logger);
        expect(actualContent).to.equal(expectedContent);
    });

    it('should add disposition-notification-to before disposition-notification-options', function() {
        var dispositionNotificationTransform = proxyquire(fs.realpathSync('./smtp/dispositionNotificationTransform.js'), {
            '../config.js': {
                // localDomainsToSendDispatchedFor: []
            }
        });
        var content = fs.readFileSync('./test/fixtures/fromUs_message_only_disposition_options.txt', {encoding: 'utf8'});
        var expectedContent = fs.readFileSync('./test/fixtures/fromUs_message_only_disposition_options_fixed.txt', {encoding: 'utf8'});
        var actualContent = dispositionNotificationTransform.doTransform(content, 'medicasofttest@direct.medicasoft.us', logger);
        expect(actualContent).to.equal(expectedContent);
    });

    it('should add disposition-notification-to before from (first header)', function() {
        var dispositionNotificationTransform = proxyquire(fs.realpathSync('./smtp/dispositionNotificationTransform.js'), {
            '../config.js': {
                // localDomainsToSendDispatchedFor: []
            }
        });
        var content = fs.readFileSync('./test/fixtures/fromUs_message_no_disposition_start.txt', {encoding: 'utf8'});
        var expectedContent = fs.readFileSync('./test/fixtures/fromUs_message_no_disposition_start_fixed.txt', {encoding: 'utf8'});
        var actualContent = dispositionNotificationTransform.doTransform(content, 'medicasofttest@direct.medicasoft.us', logger);
        expect(actualContent).to.equal(expectedContent);
    });
});