var config = require("../config.js");
var fs = require('fs');
var libxml = require('libxmljs');
var path = require('path');
var xml2js = require('xml2js');
var _ = require('underscore');

var schemaFolder = path.normalize(path.dirname(config.soapSchema) + "/");
var schema;

function validate(content, logger, callback) {
    if (!schema) {
        schema = fs.readFileSync(config.soapSchema).toString();
    }
    var xsdDoc = libxml.parseXml(schema, { baseUrl: schemaFolder });
    var xmlDoc = libxml.parseXml(content);
    var ok = xmlDoc.validate(xsdDoc);
    if (!ok) {
        var errs = _.map(xmlDoc.validationErrors, function (validationErr) {
            return validationErr.message;
        });
        logger.error("Invalid SOAP request: " + errs);
        return callback(xmlDoc.validationErrors);
    }
    return callback(null);
}

function parse(content, logger, callback) {
    xml2js.parseString(content, { tagNameProcessors: [xml2js.processors.stripPrefix] }, function (err, parsedObject) {
        if (err) {
            logger.error("Error parsing the SOAP request: " + err.toString());
            return callback(err);
        }
        var res = {
            //messageId
            //sender
            //recipients
            //attachments
        };
        var envelope = parsedObject && parsedObject.Envelope;
        var header = envelope && envelope.Header && envelope.Header[0];
        var body = envelope && envelope.Body && envelope.Body[0];

        var provideAndRegisterDocumentSetRequest = body && body.ProvideAndRegisterDocumentSetRequest && body.ProvideAndRegisterDocumentSetRequest[0];
        var submitObjectsRequest = provideAndRegisterDocumentSetRequest && provideAndRegisterDocumentSetRequest.SubmitObjectsRequest && provideAndRegisterDocumentSetRequest.SubmitObjectsRequest[0];
        var registryObjectList = submitObjectsRequest && submitObjectsRequest.RegistryObjectList && submitObjectsRequest.RegistryObjectList[0];
        var registryPackage = registryObjectList && registryObjectList.RegistryPackage && registryObjectList.RegistryPackage[0];

        // message id
        var messageId = header && header.MessageID && header.MessageID[0] && header.MessageID[0]._;
        if (messageId) {
            res.messageId = messageId;
        }

        var addressBlock = header && header.addressBlock && header.addressBlock[0];
        var sender = addressBlock && addressBlock.from && addressBlock.from[0];
        var recipients = addressBlock && addressBlock.to;
        var finalDestinationDelivery = addressBlock && addressBlock['X-DIRECT-FINAL-DESTINATION-DELIVERY'] && addressBlock['X-DIRECT-FINAL-DESTINATION-DELIVERY'][0];
        if (finalDestinationDelivery && finalDestinationDelivery.toLowerCase() === 'true') {
            res.finalDestinationDelivery = true;
        }

        // sender
        if (sender) {
            res.sender = sender;
        } else {
            var classification = registryPackage && registryPackage.Classification;
            if (classification && classification.length) {
                var author = _.find(classification, function (c) {
                    return c.$.classificationScheme === config.authorExternalClassificationUID;
                });
                var authorTelecomObject = author && author.Slot && _.find(author.Slot, function (slot) {
                    return slot.$.name === 'authorTelecommunication';
                });
                var authorTelecomValue = authorTelecomObject && authorTelecomObject.ValueList && authorTelecomObject.ValueList[0] && authorTelecomObject.ValueList[0].Value && authorTelecomObject.ValueList[0].Value[0];
                var authorEmail = extractEmailFromXTN(authorTelecomValue);
                if (authorEmail) {
                    res.sender = authorEmail;
                }
            }
        }

        // recipients
        if (recipients && recipients.length) {
            res.recipients = recipients;
        } else {
            var slot = registryPackage && registryPackage.Slot;
            if (slot && slot.length) {
                var recipientsObject = _.find(slot, function (s) {
                    return s.$.name === 'intendedRecipient';
                });
                var recipientsList = recipientsObject && recipientsObject.ValueList && recipientsObject.ValueList[0] && recipientsObject.ValueList[0].Value && _.map(recipientsObject.ValueList[0].Value, function (value) {
                    var tokens = value.split("|");
                    return tokens[2] && extractEmailFromXTN(tokens[2]);
                });
                if (recipientsList && recipientsList.length) {
                    res.recipients = recipientsList;
                }
            }
        }

        // attachments
        var attachments = [];
        var document = provideAndRegisterDocumentSetRequest && provideAndRegisterDocumentSetRequest.Document;
        if (document && document.length) {
            _.each(document, function (doc) {
                var filename = doc.$.id;
                var internalId = doc.Include && doc.Include[0] && doc.Include[0].$.href;
                if (internalId && internalId.startsWith("cid:")) {
                    internalId = internalId.substring(4);
                }
                var content = !internalId && doc._;
                var attachment = {};
                if (filename) {
                    attachment.filename = filename;
                }
                if (internalId) {
                    attachment.internalId = internalId;
                }
                if (content) {
                    attachment.content = content;
                }
                if (!_.isEmpty(attachment)) {
                    attachments.push(attachment);
                }
            });
        }
        if (attachments.length) {
            res.attachments = attachments;
        }

        logger.debug("Extracted mail info from soap message");
        return callback(null, res);
    });
}

function extractEmailFromXTN(xtn) {
    if (!xtn) {
        return;
    }
    var tokens = xtn.split("^");
    return tokens[3];
}

module.exports = {
    parse: parse,
    validate: validate
};
