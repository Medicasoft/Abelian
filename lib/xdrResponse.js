var utils = require(__dirname + "/utils.js");

function create(err, message) {
    var responseObject = {};
    if (message && message.messageId) {
        responseObject.messageId = message.messageId;
    }

    if (message && message.notificationMessage) {
        // notification messages have already been logged;
        responseObject.statusCode = 200;
        responseObject.statusMessage = "OK";
        return responseObject;
    }

    var contentTypeAction;
    var soapHeader;
    var soapBody;
    var boundary = utils.generateBoundary();
    var contentId = message && message.contentId || utils.generateContentId();
    var messageId = message && message.messageId || utils.generateMessageId();

    if (err) {
        responseObject.statusCode = 400;
        responseObject.statusMessage = "Bad Request";
    } else {
        responseObject.statusCode = 200;
        responseObject.statusMessage = "OK";
    }

    responseObject.headers = {};
    if (message && message.finalDestinationDelivery) {
        responseObject.statusCode = 200;
        responseObject.statusMessage = "OK";
        if (err) {
            contentTypeAction = "action=\"urn:ihe:iti:2007:ProvideAndRegisterDocumentSet-bResponse\"";
            soapHeader = "<wsa:Action xmlns:wsa=\"http://www.w3.org/2005/08/addressing\" xmlns:s=\"http://www.w3.org/2003/05/soap-envelope\" s:mustUnderstand=\"1\">urn:ihe:iti:2007:ProvideAndRegisterDocumentSet-bResponse</wsa:Action>" +
                "<wsa:RelatesTo xmlns:wsa=\"http://www.w3.org/2005/08/addressing\">" + messageId + "</wsa:RelatesTo>";
            soapBody = "<rs:RegistryResponse xmlns:rs=\"urn:oasis:names:tc:ebxml-regrep:xsd:rs:3.0\" status=\"urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:Failure\" />";
                // soapBody = "<direct:messageDisposition  xmlns:direct=\"urn:direct:addressing\"><direct:recipient>mailto:" + message.from + "</direct:recipient><direct:disposition>failure</direct:disposition></direct:messageDisposition>";
        } else {
            contentTypeAction = "action=\"urn:ihe:iti:2007:ProvideAndRegisterDocumentSet-bResponse\"";
            soapHeader = "<wsa:Action xmlns:wsa=\"http://www.w3.org/2005/08/addressing\" xmlns:s=\"http://www.w3.org/2003/05/soap-envelope\" s:mustUnderstand=\"1\">urn:ihe:iti:2007:ProvideAndRegisterDocumentSet-bResponse</wsa:Action>" +
                    "<wsa:RelatesTo xmlns:wsa=\"http://www.w3.org/2005/08/addressing\">" + messageId + "</wsa:RelatesTo>";
            soapBody = "<rs:RegistryResponse xmlns:rs=\"urn:oasis:names:tc:ebxml-regrep:xsd:rs:3.0\" status=\"urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:Success\" />";
            // soapBody = "<direct:messageDisposition  xmlns:direct=\"urn:direct:addressing\"><direct:recipient>mailto:" + message.from + "</direct:recipient><direct:disposition>success</direct:disposition></direct:messageDisposition>";
        }
    } else if (err) {
        responseObject.headers.connection = "close";
        if (["InvalidSoapRequest", "InvalidSoapMessage"].indexOf(err.message) !== 1) {
            contentTypeAction = "action=\"http://www.w3.org/2005/08/addressing/soap/fault\"";
            soapHeader = "<wsa:Action>http://www.w3.org/2005/08/addressing/soap/fault</wsa:Action>";
            soapBody = "" +
                "<soapenv:Fault>" +
                "<soapenv:Code>" +
                "<soapenv:Value>soapenv:Receiver</soapenv:Value>" +
                "</soapenv:Code>" +
                "<soapenv:Reason>" +
                "<soapenv:Text xml:lang=\"en-US\">" + err.message + "</soapenv:Text>" +
                "</soapenv:Reason>" +
                "<soapenv:Detail />" +
                "</soapenv:Fault>";
        } else if (["InvalidDocumentContent", "XDSMissingDocument", "XDSMissingDocumentMetadata"].indexOf(err.message) !== -1) {
            contentTypeAction = "action=\"urn:ihe:iti:2007:ProvideAndRegisterDocumentSet-bResponse\"";
            soapHeader = "<wsa:Action xmlns:wsa=\"http://www.w3.org/2005/08/addressing\" xmlns:s=\"http://www.w3.org/2003/05/soap-envelope\" s:mustUnderstand=\"1\">urn:ihe:iti:2007:ProvideAndRegisterDocumentSet-bResponse</wsa:Action>" +
                "<wsa:RelatesTo xmlns:wsa=\"http://www.w3.org/2005/08/addressing\">" + messageId + "</wsa:RelatesTo>";
            soapBody = "" +
                "<rs:RegistryResponse xmlns:rs=\"urn:oasis:names:tc:ebxml-regrep:xsd:rs:3.0\" status=\"urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:Failure\">" +
                "<rs:RegistryErrorList>" +
                "<rs:RegistryError errorCode=\"" + err.message + "\" codeContext=\"" + (err.codeContext || "") + "\" location=\"DocumentEntryValidator\" severity=\"urn:oasis:names:tc:ebxml-regrep:ErrorSeverityType:Error\"/>" +
                "</rs:RegistryErrorList>" +
                "</rs:RegistryResponse>";
        } else {
            contentTypeAction = "action=\"urn:ihe:iti:2007:ProvideAndRegisterDocumentSet-bResponse\"";
            soapHeader = "<wsa:Action xmlns:wsa=\"http://www.w3.org/2005/08/addressing\" xmlns:s=\"http://www.w3.org/2003/05/soap-envelope\" s:mustUnderstand=\"1\">urn:ihe:iti:2007:ProvideAndRegisterDocumentSet-bResponse</wsa:Action>" +
                "<wsa:RelatesTo xmlns:wsa=\"http://www.w3.org/2005/08/addressing\">" + messageId + "</wsa:RelatesTo>";
            //not sure here
            soapBody = "" +
                "<rs:RegistryResponse xmlns:rs=\"urn:oasis:names:tc:ebxml-regrep:xsd:rs:3.0\" status=\"urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:Failure\">" +
                "<rs:RegistryErrorList>" +
                "<rs:RegistryError errorCode=\"" + err.message + "\" codeContext=\"" + (err.codeContext || "") + "\" location=\"DocumentEntryValidator\" severity=\"urn:oasis:names:tc:ebxml-regrep:ErrorSeverityType:Error\"/>" +
                "</rs:RegistryErrorList>" +
                "</rs:RegistryResponse>";
        }
    } else {
        contentTypeAction = "action=\"urn:ihe:iti:2007:ProvideAndRegisterDocumentSet-bResponse\"";
        soapHeader = "<wsa:Action xmlns:wsa=\"http://www.w3.org/2005/08/addressing\" xmlns:s=\"http://www.w3.org/2003/05/soap-envelope\" s:mustUnderstand=\"1\">urn:ihe:iti:2007:ProvideAndRegisterDocumentSet-bResponse</wsa:Action>" +
            "<wsa:RelatesTo xmlns:wsa=\"http://www.w3.org/2005/08/addressing\">" + messageId + "</wsa:RelatesTo>";
        soapBody = "<rs:RegistryResponse xmlns:rs=\"urn:oasis:names:tc:ebxml-regrep:xsd:rs:3.0\" status=\"urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:Success\" />";
    }

    responseObject.headers["Content-Type"] = "" +
        "multipart/related; " +
        "boundary=\"" + boundary + "\"; " +
        "type=\"application/xop+xml\"; " +
        "start=\"" + contentId + "\"; " +
        "start-info=\"application/soap+xml\"; " +
        contentTypeAction;

    responseObject.body = "" +
        "--" + boundary + "\r\n" +
        "Content-Type: application/xop+xml; charset=UTF-8; type=\"application/soap+xml\"\r\n" +
        "Content-Transfer-Encoding: binary\r\n" +
        "Content-ID: " + contentId + "\r\n" +
        "\r\n" +
        "<S:Envelope xmlns:S=\"http://www.w3.org/2003/05/soap-envelope\">" +
        "<S:Header>" +
        soapHeader +
        "</S:Header>" +
        "<S:Body>" +
        soapBody +
        "</S:Body>" +
        "</S:Envelope>\r\n" +
        "--" + boundary + "--" +
        "\r\n";

    return responseObject;
}
module.exports = {
    create: create
};