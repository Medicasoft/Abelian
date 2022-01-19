var async = require('async');
var path = require('path');
var zip = new require("jszip")();
var _ = require('underscore');
var xml2js = require('xml2js');
var config = require(__dirname + "/../config.js");
var mimeParser = require(__dirname + "/mimeParser.js");
var mtomParser = require(__dirname + "/mtomParser.js");
var soapParser = require(__dirname + "/soapParser.js");
var utils = require(__dirname + "/utils.js");

function Message() {
    this.from = "";
    this.to = [];
    this.attachments = [];
    this.messageId = "";
    this.contentId = "";
    this.subject = "";
    this.text = "";
    this.date = "";
}


Message.prototype.buildFromXDR = function (content, logger, callback) {
    var self = this;

    // parse MTOM/XOP message end extract the SOAP part and the attachments
    var parsedBody = mtomParser.parse(content, logger);

    if (!parsedBody || !parsedBody.soap || !parsedBody.soap.content) {
        var err = new Error("InvalidRequestBody");
        logger.error("Could not extract the SOAP request from the XDR");
        return callback(err);
    }

    var mailInfo;

    async.series([
        function (cb) {
            soapParser.validate(parsedBody.soap.content, logger, function (err) {
                if (err) {
                    return cb(new Error("InvalidSoapRequest"));
                } else {
                    return cb(null);
                }
            });
        },
        function (cb) {
            // parse the SOAP part and instantiate Message fields
            soapParser.parse(parsedBody.soap.content, logger, function (err, resp) {
                if (err) {
                    return cb(new Error("InvalidSoapRequest"));
                } else {
                    mailInfo = resp;
                    return cb(null);
                }
            });
        },
        function (cb) {
            if (!mailInfo || !mailInfo.sender || !mailInfo.recipients) {
                err = new Error("InvalidSoapMessage");
                logger.error("Could not extract sender or recipients from the SOAP metadata");
                return cb(err);
            }

            self.from = mailInfo.sender;
            self.to = mailInfo.recipients;
            self.messageId = mailInfo.messageId || utils.generateMessageId();
            self.finalDestinationDelivery = mailInfo.finalDestinationDelivery;

            if (parsedBody && parsedBody.attachments && mailInfo.attachments && mailInfo.attachments.length) {
                _.each(mailInfo.attachments, function (attachment) {
                    if (attachment.internalId) {
                        var found = _.find(parsedBody.attachments, function (attch) {
                            var id = attch.meta && attch.meta["Content-ID"];
                            return utils.stripContentId(id) === attachment.internalId;
                        });
                        if (found) {
                            if (found.content) {
                                attachment.content = found.content;
                                if (attachment.content.startsWith("<direct:messageDisposition")) {
                                    var status = attachment.content.match(/<direct:disposition>(.*)<\/direct:disposition>/)[1];
                                    if (status === "success" || status === "failure") {
                                        self.notificationMessage = true;
                                        self.mdn = status;
                                    }
                                }
                            }
                            if (found.meta && found.meta["Content-Type"]) {
                                attachment.contentType = found.meta["Content-Type"];
                            }
                        } else {
                            err = new Error("XDSMissingDocumentMetadata");
                            err.codeContext = attachment.internalId;
                            logger.error("MIME package contains MIME part with ContentId header not found in metadata");
                            return cb(err);
                        }
                    }
                });
            }

            self.attachments = mailInfo.attachments;
            self.contentId = parsedBody && parsedBody.soap && parsedBody.soap.meta && parsedBody.soap.meta["Content-ID"];
            self.contentId = self.contentId || utils.generateContentId();
            self.subject = mailInfo.subject;
            self.date = mailInfo.date;
            self.text = mailInfo.text;
            return cb(null);
        }
    ], function (err) {
        return callback(err);
    });
};

Message.prototype.buildFromSMTP = function (content, logger, callback) {
    var self = this;

    mimeParser.parse(content, logger, function (err, mailInfo) {
        if (err) {
            logger.error("Error parsing the SMTP message: " + err.toString());
            return callback(err);
        }

        self.from = mailInfo.from && mailInfo.from[0] && mailInfo.from[0].address;
        if (!self.from) {
            var err2 = new Error("Invalid SMTP message");
            logger.error("Could not extract sender from the SMTP message");
            return callback(err2);
        }

        self.to = mailInfo.to && mailInfo.to.map(function (recipient) {
            return recipient.address;
        });
        if (!self.to) {
            var err2 = new Error("Invalid SMTP message");
            logger.error("Could not extract recipients from the SMTP message");
            return callback(err2);
        }

        self.attachments = mailInfo.attachments && mailInfo.attachments.map(function (att) {
            if (!att.contentId.startsWith("<") || !att.contentId.endsWith(">")) {
                att.contentId = "<" + att.contentId + ">";
            }
            return att;
        });
        self.messageId = mailInfo.messageId || utils.generateMessageId();
        self.contentId = utils.generateContentId();
        self.subject = mailInfo.subject;
        self.date = mailInfo.date;
        self.text = mailInfo.text;
        return callback(null);
    });
};

/**
 *
 * @param {object} params
 * @param {string} params.type  Type of XSD metadata. Possible values: "XDS" | "minimal"
 * @param {object} logger
 * @param {string} boundaryStr  Mime boundary string
 * @param {function} callback
 */
Message.prototype.toXDR = function (params, logger, boundaryStr, callback) {
    var boundary = boundaryStr || utils.generateBoundary();
    var messages = [];
    var self = this;

    var isXDM = this.subject && this.subject.toLowerCase() && this.subject.toLowerCase().indexOf("xdm/1.0/ddm") !== -1;
    if (isXDM) {
        async.each(this.attachments, function (attachment, cb) {
            _xdmToXdr.call(self, attachment, boundaryStr, params, logger, function (err, resp) {
                if (resp && resp.length) {
                    messages = messages.concat(_.flatten(resp));
                }
                return cb(err);
            });
        }, function (err) {
            return callback(err, messages);
        });
    } else {
        var message = "--" + boundary + "\r\n" +
            "Content-Type: application/xop+xml; charset=UTF-8; type=\"application/soap+xml\"\r\n" +
            "Content-Transfer-Encoding: text/xml; charset=utf-8\r\n" +
            "Content-ID: " + this.contentId + "\r\n" +
            "\r\n" +
            _buildSoapRequest(params, this.messageId, this.from, this.to, this.attachments, this.relatesToMessageId) +
            "\r\n";
        if (this.attachments) {
            message += this.attachments.map(function (attachment) {
                return "--" + boundary + "\r\n" +
                    "Content-Type: " + attachment.contentType + "\r\n" +
                    "Content-Transfer-Encoding: " + attachment.transferEncoding + "\r\n" +
                    "Content-ID: " + attachment.contentId + "\r\n" +
                    "\r\n" +
                    attachment.content +
                    "\r\n";
            }).join('');
            message += "\r\n";
        }
        message += "--" + boundary + "--\r\n";
        messages.push(message);

        logger.debug("Generated XDR messages");
        return callback(null, messages);
    }
};

Message.prototype.toSMTP = function (params, logger) {
    var self = this;
    var message = {
        from: self.from,
        to: self.to.join(","),
        text: 'Generated SMTP message',
        subject: "automatic mail",
        attachments: self.attachments.map(function (attachment) {
            return _.pick(attachment, "content", "contentType", "filename");
        })
    };

    if (this.finalDestinationDelivery) {
        message.headers = {
            "Disposition-Notification-To": self.from,
            "Disposition-Notification-Options": "X-DIRECT-FINAL-DESTINATION-DELIVERY=optional,true"
        };
    }

    logger.debug("Generated SMTP message: " + message);
    return message;
};

function _buildSoapRequestFromSubmitObjectsRequest(params, messageId, sender, recipients, attachments, submitObjectsRequest) {
    var xdrType = params && params.xdrType || 'minimal';
    var documentSection = "";
    _.each(attachments, function (attachment, index) {
        var documentId = attachment.generatedFileName || "Document" + index;
        documentSection += _buildDocument(documentId, attachment);
    });
    return "<?xml version='1.0' encoding='UTF-8'?>" +
        "<soapenv:Envelope xmlns:soapenv=\"http://www.w3.org/2003/05/soap-envelope\">" +
        _buildSoapHeader(xdrType, messageId, sender, recipients, null) +
        "<soapenv:Body>" +
        "<xdsb:ProvideAndRegisterDocumentSetRequest xmlns:xdsb=\"urn:ihe:iti:xds-b:2007\">" +
        submitObjectsRequest +
        documentSection +
        "</xdsb:ProvideAndRegisterDocumentSetRequest>" +
        "</soapenv:Body>" +
        "</soapenv:Envelope>" +
        "\r\n";
}

function _buildSoapRequest(params, messageId, sender, recipients, attachments, relatesToMessageId) {
    var xdrType = params && params.xdrType || 'minimal';

    return "<?xml version='1.0' encoding='UTF-8'?>" +
        "<soapenv:Envelope xmlns:soapenv=\"http://www.w3.org/2003/05/soap-envelope\">" +
        _buildSoapHeader(xdrType, messageId, sender, recipients, relatesToMessageId) +
        _buildSoapBody(xdrType, sender, recipients, attachments) +
        "</soapenv:Envelope>" +
        "\r\n";
}

function _buildSoapHeader(xdrType, messageId, sender, recipients, relatesToMessageId) {
    return "<soapenv:Header xmlns:wsa=\"http://www.w3.org/2005/08/addressing\">" +
        "<direct:metadata-level xmlns:direct=\"urn:direct:addressing\">" + xdrType + "</direct:metadata-level>" +
        "<direct:addressBlock xmlns:direct=\"urn:direct:addressing\" soapenv:role=\"urn:direct:addressing:destination\" soapenv:relay=\"true\">" +
        "<direct:from>" + sender +
        "</direct:from>" +
        "<direct:to>" + recipients.join(",") +
        "</direct:to>" +
        (relatesToMessageId ? ('<direct:notification relatesTo="' + relatesToMessageId + '"/>') : '') +
        "</direct:addressBlock>" +
        "<wsa:To soapenv:mustUnderstand=\"true\">" + config.xdrServer.host + ":" + config.xdrServer.port + config.xdrServer.path +
        "</wsa:To>" +
        "<wsa:MessageID soapenv:mustUnderstand=\"true\">" + messageId +
        "</wsa:MessageID>" +
        "<wsa:Action soapenv:mustUnderstand=\"true\">urn:ihe:iti:2007:ProvideAndRegisterDocumentSet-b" +
        "</wsa:Action>" +
        "</soapenv:Header>";
}

function _buildSoapBody(xdrType, sender, recipients, attachments) {
    var extrinsicObjectSection = "";
    var associationSection = "";
    var documentSection = "";
    var registryPackageId = utils.generateUuid();
    var registryPackageSection = _buildRegistryPackage(sender, recipients, registryPackageId);
    _.each(attachments, function (attachment, index) {
        var documentId = attachment.generatedFileName || "Document" + index;
        extrinsicObjectSection += _buildExtrinsicObject(xdrType, attachment, documentId);
        associationSection += _buildAssociation(documentId, registryPackageId);
        documentSection += _buildDocument(documentId, attachment);
    });
    return "<soapenv:Body>" +
        "<xdsb:ProvideAndRegisterDocumentSetRequest xmlns:xdsb=\"urn:ihe:iti:xds-b:2007\">" +
        "<lcm:SubmitObjectsRequest xmlns:lcm=\"urn:oasis:names:tc:ebxml-regrep:xsd:lcm:3.0\">" +
        "<rim:RegistryObjectList xmlns:rim=\"urn:oasis:names:tc:ebxml-regrep:xsd:rim:3.0\">" +
        extrinsicObjectSection +
        registryPackageSection +
        "<rim:Classification classifiedObject=\"" + registryPackageId + "\" classificationNode=\"" + config.constants.registryPackageType + "\" id=\"" + utils.generateUuid() + "\" objectType=\"urn:oasis:names:tc:ebxml-regrep:ObjectType:RegistryObject:Classification\" />" +
        associationSection +
        "</rim:RegistryObjectList>" +
        "</lcm:SubmitObjectsRequest>" +
        documentSection +
        "</xdsb:ProvideAndRegisterDocumentSetRequest>" +
        "</soapenv:Body>";
}

function _buildExtrinsicObject(xdrType, attachment, documentId) {
    var date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    var result = "<rim:ExtrinsicObject id=\"" + documentId + "\" mimeType=\"" + attachment.contentType + "\" objectType=\"" + config.constants.stableDocumentEntry + "\">" +
        "<rim:Slot name=\"creationTime\">" +
        "<rim:ValueList>" +
        "<rim:Value>" + date + "</rim:Value>" +
        "</rim:ValueList>" +
        "</rim:Slot>";
    if (xdrType === "XDS") {
        result += "<rim:Slot name=\"languageCode\">" +
            "<rim:ValueList>" +
            "<rim:Value>en-us" +
            "</rim:Value>" +
            "</rim:ValueList>" +
            "</rim:Slot>";
    }
    result += "<rim:Slot name=\"serviceStartTime\">" +
        "<rim:ValueList>" +
        "<rim:Value>" + date + "</rim:Value>" +
        "</rim:ValueList>" +
        "</rim:Slot>" +
        "<rim:Slot name=\"serviceStopTime\">" +
        "<rim:ValueList>" +
        "<rim:Value>" + date + "</rim:Value>" +
        "</rim:ValueList>" +
        "</rim:Slot>" +
        "<rim:Slot name=\"sourcePatientId\">" +
        "<rim:ValueList>" +
        "<rim:Value>" + config.constants.patient.patientId +
        "</rim:Value>" +
        "</rim:ValueList>" +
        "</rim:Slot>";
    if (xdrType === "XDS") {
        result += "<rim:Slot name=\"sourcePatientInfo\">" +
            "<rim:ValueList>" +
            "<rim:Value>PID-3|" + config.constants.patient.patientId +
            "</rim:Value>" +
            "<rim:Value>PID-5|" + config.constants.patient.name +
            "</rim:Value>" +
            "<rim:Value>PID-7|" + config.constants.patient.birthDate +
            "</rim:Value>" +
            "<rim:Value>PID-8|" + config.constants.patient.sex +
            "</rim:Value>" +
            "<rim:Value>PID-11|" + config.constants.patient.address +
            "</rim:Value>" +
            "</rim:ValueList>" +
            "</rim:Slot>";
    }
    result += "<rim:Name>" +
        "<rim:LocalizedString value=\"Doc_" + utils.generateGuid() + "\" />" +
        "</rim:Name>" +
        "<rim:Description />" +
        // "<rim:Classification classificationScheme=\"urn:uuid:93606bcf-9494-43ec-9b4e-a7748d1a838d\" classifiedObject=\"" + documentId + "\" nodeRepresentation=\"\" objectType=\"urn:oasis:names:tc:ebxml-regrep:ObjectType:RegistryObject:Classification\" id=\"id_" + guid.v4() + "\"">" +
        // "<rim:Slot name=\"authorPerson\">" +
        // "<rim:ValueList>" +
        // "<rim:Value>7.6^GenericApplication - Version 7.6" +
        // "</rim:Value>" +
        // "</rim:ValueList>" +
        // "</rim:Slot>" +
        // "<rim:Slot name=\"authorInstitution\">" +
        // "<rim:ValueList>" +
        // "<rim:Value>Get Well Clinic" +
        // "</rim:Value>" +
        // "</rim:ValueList>" +
        // "</rim:Slot>" +
        // "</rim:Classification>" +
        "<rim:Classification classificationScheme=\"urn:uuid:41a5887f-8865-4c09-adf7-e362475b143a\" classifiedObject=\"" + documentId + "\" nodeRepresentation=\"34133-9\" objectType=\"urn:oasis:names:tc:ebxml-regrep:ObjectType:RegistryObject:Classification\" id=\"id_" + utils.generateGuid() + "\">" +
        "<rim:Slot name=\"codingScheme\">" +
        "<rim:ValueList>" +
        "<rim:Value>2.16.840.1.113883.6.1" +
        "</rim:Value>" +
        "</rim:ValueList>" +
        "</rim:Slot>" +
        "<rim:Name>" +
        "<rim:LocalizedString value=\"Summarization of Episode Note\" />" +
        "</rim:Name>" +
        "</rim:Classification>";
    if (xdrType === "XDS") {
        result += "<!-- Value from HITSP/C80 table 2-146 -->" +
            "<rim:Classification classificationScheme=\"urn:uuid:f4f85eac-e6cb-4883-b524-f2705394840f\" classifiedObject=\"" + documentId + "\" nodeRepresentation=\"N\" objectType=\"urn:oasis:names:tc:ebxml-regrep:ObjectType:RegistryObject:Classification\" id=\"id_" + utils.generateGuid() + "\">" +
            "<rim:Slot name=\"codingScheme\">" +
            "<rim:ValueList>" +
            "<rim:Value>HITSP/C80" +
            "</rim:Value>" +
            "</rim:ValueList>" +
            "</rim:Slot>" +
            "<rim:Name>" +
            "<rim:LocalizedString value=\"Normal\" />" +
            "</rim:Name>" +
            "</rim:Classification>" +
            "<!-- Not using HITSP/C80 Table 2-152 because none applied for C-CDA -->" +
            "<rim:Classification classificationScheme=\"urn:uuid:a09d5840-386c-46f2-b5ad-9c3699a4309d\" classifiedObject=\"" + documentId + "\" nodeRepresentation=\"CDAR2/IHE 1.0\" objectType=\"urn:oasis:names:tc:ebxml-regrep:ObjectType:RegistryObject:Classification\" id=\"id_" + utils.generateGuid() + "\">" +
            "<rim:Slot name=\"codingScheme\">" +
            "<rim:ValueList>" +
            "<rim:Value>Connect-a-thon formatCodes" +
            "</rim:Value>" +
            "</rim:ValueList>" +
            "</rim:Slot>" +
            "<rim:Name>" +
            "<rim:LocalizedString value=\"CDAR2/IHE 1.0\" />" +
            "</rim:Name>" +
            "</rim:Classification>";
    }
    result += "<!-- Value from HITSP/C80 table 2-146 -->" +
        "<rim:Classification classificationScheme=\"urn:uuid:f33fb8ac-18af-42cc-ae0e-ed0b0bdb91e1\" classifiedObject=\"" + documentId + "\" nodeRepresentation=\"72311000\" objectType=\"urn:oasis:names:tc:ebxml-regrep:ObjectType:RegistryObject:Classification\" id=\"id_" + utils.generateGuid() + "\">" +
        "<rim:Slot name=\"codingScheme\">" +
        "<rim:ValueList>" +
        "<rim:Value>2.16.840.1.113883.6.96" +
        "</rim:Value>" +
        "</rim:ValueList>" +
        "</rim:Slot>" +
        "<rim:Name>" +
        "<rim:LocalizedString value=\"Health maintenance organization\" />" +
        "</rim:Name>" +
        "</rim:Classification>" +
        "<!-- Value from HITSP/C80 table 2-149 -->" +
        "<rim:Classification classificationScheme=\"urn:uuid:cccf5598-8b07-4b77-a05e-ae952c785ead\" classifiedObject=\"" + documentId + "\" nodeRepresentation=\"408443003\" objectType=\"urn:oasis:names:tc:ebxml-regrep:ObjectType:RegistryObject:Classification\" id=\"id_" + utils.generateGuid() + "\">" +
        "<rim:Slot name=\"codingScheme\">" +
        "<rim:ValueList>" +
        "<rim:Value>2.16.840.1.113883.6.96" +
        "</rim:Value>" +
        "</rim:ValueList>" +
        "</rim:Slot>" +
        "<rim:Name>" +
        "<rim:LocalizedString value=\"General medical practice\" />" +
        "</rim:Name>" +
        "</rim:Classification>" +
        "<!-- LOINC code from HITSP/C80 table 2-144  -->" +
        "<rim:Classification classificationScheme=\"urn:uuid:f0306f51-975f-434e-a61c-c59651d33983\" classifiedObject=\"" + documentId + "\" nodeRepresentation=\"34133-9\" objectType=\"urn:oasis:names:tc:ebxml-regrep:ObjectType:RegistryObject:Classification\" id=\"id_" + utils.generateGuid() + "\">" +
        "<rim:Slot name=\"codingScheme\">" +
        "<rim:ValueList>" +
        "<rim:Value>2.16.840.1.113883.6.1" +
        "</rim:Value>" +
        "</rim:ValueList>" +
        "</rim:Slot>" +
        "<rim:Name>" +
        "<rim:LocalizedString value=\"Summarization of episode note\" />" +
        "</rim:Name>" +
        "</rim:Classification>" +
        "<rim:ExternalIdentifier identificationScheme=\"urn:uuid:58a6f841-87b3-4a3e-92fd-a8ffeff98427\" value=\"" + config.constants.patient.patientId + "\" objectType=\"urn:oasis:names:tc:ebxml-regrep:ObjectType:RegistryObject:ExternalIdentifier\" id=\"id_" + utils.generateGuid() + "\" registryObject=\"" + documentId + "\">" +
        "<rim:Name>" +
        "<rim:LocalizedString value=\"XDSDocumentEntry.patientId\" />" +
        "</rim:Name>" +
        "</rim:ExternalIdentifier>" +
        "<rim:ExternalIdentifier identificationScheme=\"urn:uuid:2e82c1f6-a085-4c72-9da3-8640a32e42ab\" value=\"1.42.20140915172101.10.1\" objectType=\"urn:oasis:names:tc:ebxml-regrep:ObjectType:RegistryObject:ExternalIdentifier\" id=\"id_" + utils.generateGuid() + "\" registryObject=\"" + documentId + "\">" +
        "<rim:Name>" +
        "<rim:LocalizedString value=\"XDSDocumentEntry.uniqueId\" />" +
        "</rim:Name>" +
        "</rim:ExternalIdentifier>" +
        "</rim:ExtrinsicObject>";
    return result;
}

function _buildRegistryPackage(sender, recipients, registryPackageId) {
    var date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return "<rim:RegistryPackage id=\"" + registryPackageId + "\" objectType=\"urn:oasis:names:tc:ebxml-regrep:ObjectType:RegistryObject:RegistryPackage\">" +
        "<rim:Slot name=\"submissionTime\">" +
        "<rim:ValueList>" +
        "<rim:Value>" + date +
        "</rim:Value>" +
        "</rim:ValueList>" +
        "</rim:Slot>" +
        "<rim:Slot name=\"intendedRecipient\">" +
        "<rim:ValueList>" +

        recipients.map(function (recipient) {
            return "<rim:Value>||^^Internet^" + recipient + "</rim:Value>";
        }).join('') +

        "</rim:ValueList>" +
        "</rim:Slot>" +
        "<rim:Name>" +
        "<rim:LocalizedString value=\"Physical\" />" +
        "</rim:Name>" +
        "<rim:Description>" +
        "<rim:LocalizedString value=\"Annual physical\" />" +
        "</rim:Description>" +
        "<rim:Classification classificationScheme=\"urn:uuid:a7058bb9-b4e4-4307-ba5b-e3f0ab85e12d\" classifiedObject=\"" + registryPackageId + "\" nodeRepresentation=\"\" objectType=\"urn:oasis:names:tc:ebxml-regrep:ObjectType:RegistryObject:Classification\" id=\"id_" + utils.generateGuid() + "\">" +
        "<rim:Slot name=\"authorPerson\">" +
        "<rim:ValueList>" +
        "<rim:Value>7.6^GenericApplication - Version 7.6" +
        "</rim:Value>" +
        "</rim:ValueList>" +
        "</rim:Slot>" +
        "<rim:Slot name=\"authorInstitution\">" +
        "<rim:ValueList>" +
        "<rim:Value>Get Well Clinic" +
        "</rim:Value>" +
        "</rim:ValueList>" +
        "</rim:Slot>" +
        "<rim:Slot name=\"authorTelecommunication\">" +
        "<rim:ValueList>" +

        "<rim:Value>^^Internet^" + sender + "</rim:Value>" +

        "</rim:ValueList>" +
        "</rim:Slot>" +
        "</rim:Classification>" +
        "<rim:Classification classificationScheme=\"urn:uuid:aa543740-bdda-424e-8c96-df4873be8500\" classifiedObject=\"" + registryPackageId + "\" nodeRepresentation=\"34133-9\" objectType=\"urn:oasis:names:tc:ebxml-regrep:ObjectType:RegistryObject:Classification\" id=\"id_" + utils.generateGuid() + "\">" +
        "<rim:Slot name=\"codingScheme\">" +
        "<rim:ValueList>" +
        "<rim:Value>2.16.840.1.113883.6.1" +
        "</rim:Value>" +
        "</rim:ValueList>" +
        "</rim:Slot>" +
        "<rim:Name>" +
        "<rim:LocalizedString value=\"Summarization of Episode Note\" />" +
        "</rim:Name>" +
        "</rim:Classification>" +
        "<rim:ExternalIdentifier identificationScheme=\"urn:uuid:96fdda7c-d067-4183-912e-bf5ee74998a8\" value=\"2.16.840.1.113883.3.72.5.1511258117729\" objectType=\"urn:oasis:names:tc:ebxml-regrep:ObjectType:RegistryObject:ExternalIdentifier\" id=\"id_" + utils.generateGuid() + "\" registryObject=\"" + registryPackageId + "\">" +
        "<rim:Name>" +
        "<rim:LocalizedString value=\"XDSSubmissionSet.uniqueId\" />" +
        "</rim:Name>" +
        "</rim:ExternalIdentifier>" +
        "<rim:ExternalIdentifier id=\"fefcba76-ab23-4138-96ce-795f02b26d79\" registryObject=\"" + registryPackageId + "\" identificationScheme=\"urn:uuid:554ac39e-e3fe-47fe-b233-965d2a147832\" value=\"1.2.840.114350.1.13.252.1.7.2.688879\">" +
        "<rim:Name>" +
        "<rim:LocalizedString value=\"XDSSubmissionSet.sourceId\" />" +
        "</rim:Name>" +
        "</rim:ExternalIdentifier>" +
        "<rim:ExternalIdentifier identificationScheme=\"urn:uuid:6b5aea1a-874d-4603-a4bc-96a0a7b38446\" value=\"" + config.constants.patient.patientId + "\" objectType=\"urn:oasis:names:tc:ebxml-regrep:ObjectType:RegistryObject:ExternalIdentifier\" id=\"id_" + utils.generateGuid() + "\" registryObject=\"" + registryPackageId + "\">" +
        "<rim:Name>" +
        "<rim:LocalizedString value=\"XDSSubmissionSet.patientId\" />" +
        "</rim:Name>" +
        "</rim:ExternalIdentifier>" +
        "</rim:RegistryPackage>";
}

function _buildAssociation(documentId, registryPackageId) {
    return "<rim:Association associationType=\"urn:oasis:names:tc:ebxml-regrep:AssociationType:HasMember\" sourceObject=\"" + registryPackageId + "\" targetObject=\"" + documentId + "\" id=\"id_" + utils.generateGuid() + "\" objectType=\"urn:oasis:names:tc:ebxml-regrep:ObjectType:RegistryObject:Association\">" +
        "<rim:Slot name=\"SubmissionSetStatus\">" +
        "<rim:ValueList>" +
        "<rim:Value>Original" +
        "</rim:Value>" +
        "</rim:ValueList>" +
        "</rim:Slot>" +
        "</rim:Association>";
}

function _buildDocument(documentId, attachment) {
    var contentId = utils.stripContentId(attachment.contentId);
    return "<xdsb:Document id=\"" + documentId + "\">" +
        "<xop:Include xmlns:xop=\"http://www.w3.org/2004/08/xop/include\" href=\"cid:" + contentId + "\" />" +
        "</xdsb:Document>";
}

function _xdmToXdr(xdmAttachment, boundary, params, logger, callback) {
    if (!xdmAttachment || xdmAttachment.contentType !== "application/zip" || !xdmAttachment.content) {
        return callback(null);
    }
    var options = {};
    if (xdmAttachment.transferEncoding === "base64") {
        options.base64 = true;
    }
    var self = this;
    zip.loadAsync(xdmAttachment.content, options).then(function (archive) {
        var metadataFiles = _.filter(Object.keys(archive.files), function (filename) {
            return filename.toLowerCase().match(/^ihe_xdm.*\/metadata\.xml$/);
        });
        if (!metadataFiles || !metadataFiles.length) {
            return callback(null);
        }
        async.map(metadataFiles, function (file, cb) {
            var folder = path.dirname(file) + "/";
            zip.file(file).async("text").then(function (data) {
                xml2js.parseString(data, { tagNameProcessors: [xml2js.processors.stripPrefix] }, function (err, parsedObject) {
                    if (err) {
                        logger.error("Error parsing " + file + " from the XDM attachment");
                        return cb(err);
                    }
                    var submitObjectsRequest = parsedObject && parsedObject.SubmitObjectsRequest;
                    var registryObjectList = submitObjectsRequest && submitObjectsRequest.RegistryObjectList && submitObjectsRequest.RegistryObjectList[0];
                    var registryPackage = registryObjectList && registryObjectList.RegistryPackage && registryObjectList.RegistryPackage[0];
                    var extrinsicObject = registryObjectList && registryObjectList.ExtrinsicObject;
                    if (!extrinsicObject || !extrinsicObject.length) {
                        return cb(null);
                    }
                    var fileInfo = {};
                    _.each(extrinsicObject, function (obj) {
                        var mimeType = obj.$ && obj.$.mimeType;

                        var uriIndex, sizeIndex, hashIndex;
                        _.each(obj.Slot, function (slot, index) {
                            var name = slot && slot.$ && slot.$.name;
                            switch (name) {
                                case "URI":
                                    uriIndex = index;
                                    break;
                                case "size":
                                    sizeIndex = index;
                                    break;
                                case "hash":
                                    hashIndex = index;
                                    break;
                            }
                        });

                        var fileName;
                        if (uriIndex !== -1) {
                            var uri = obj.Slot[uriIndex];
                            fileName = uri && uri.ValueList && uri.ValueList[0] && uri.ValueList[0].Value && uri.ValueList[0].Value[0];
                        }
                        var filePath = fileName && folder + fileName;

                        if (!mimeType || !filePath) {
                            logger.error("Invalid XDM metadata file. Missing mimeType or URI from attachment.");
                            return cb(new Error("InvalidXDMMetadata"));
                        }

                        obj.Slot.splice(uriIndex, 1);
                        obj.Slot.splice(sizeIndex - 1, 1);
                        obj.Slot.splice(hashIndex - 2, 1);
                        fileInfo[filePath] = {
                            generatedFileName: obj.$.id,
                            mimeType: mimeType
                        };
                    });
                    if (!fileInfo) {
                        return cb(null);
                    }
                    var attachments = _.chain(zip.files)
                        .pick(Object.keys(fileInfo))
                        .values()
                        .each(function (obj) {
                            obj.generatedFileName = fileInfo[obj.name].generatedFileName;
                            obj.contentId = utils.generateContentId();
                            obj.contentType = fileInfo[obj.name].mimeType;
                        }).value();

                    //add intendedRecipient
                    registryPackage.Slot.push({
                        "$": {
                            "name": "intendedRecipient"
                        },
                        "ValueList": [{
                            "Value": self.to.map(function (recipient) {
                                return "||^^Internet^" + recipient;
                            })
                        }]
                    });
                    //add authorTelecommunication
                    // registryPackage.Slot.push({
                    //     "$": {
                    //         "name": "authorTelecommunication"
                    //     },
                    //     "ValueList": [{
                    //         "Value": "^^Internet^" + self.from
                    //     }]
                    // });

                    var builder = new xml2js.Builder({ headless: true });
                    submitObjectsRequest = builder.buildObject(parsedObject);
                    var message = "--" + boundary + "\r\n" +
                        "Content-Type: application/xop+xml; charset=UTF-8; type=\"application/soap+xml\"\r\n" +
                        "Content-Transfer-Encoding: text/xml; charset=utf-8\r\n" +
                        "Content-ID: " + self.contentId + "\r\n" +
                        "\r\n" +
                        _buildSoapRequestFromSubmitObjectsRequest(params, self.messageId, self.from, self.to, attachments, submitObjectsRequest) +
                        "\r\n";
                    async.eachSeries(attachments, function (attachment, cb1) {
                        var type;
                        switch (attachment.contentType) {
                            case "base64":
                                type = "base64";
                                break;
                            case "text/xml":
                                type = "text";
                                break;
                            case "binary":
                            case "application/pdf":
                                type = "binarystring";
                                break;
                        }
                        if (!type) {
                            logger.debug("Unknown attachment content type");
                            return cb1(null);
                        }
                        zip.file(attachment.name)
                            .async(type)
                            .then(function (content) {
                                message += "--" + boundary + "\r\n" +
                                    "Content-Type: " + attachment.contentType + "\r\n" +
                                    "Content-Transfer-Encoding: " + attachment.transferEncoding + "\r\n" +
                                    "Content-ID: " + attachment.contentId + "\r\n" +
                                    "\r\n" +
                                    content +
                                    "\r\n";
                                return cb1(null);
                            });
                    }, function (err2) {
                        if (err2) {
                            return cb(err2);
                        }
                        message += "\r\n";
                        message += "--" + boundary + "--\r\n";
                        return cb(null, message);
                    });
                });
            });
        }, function (err, res) {
            return callback(err, res);
        });
    });
}

module.exports.Message = Message;