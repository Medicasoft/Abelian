var STATES = {
    init: 0x1,
    soapMeta: 0x2,
    soapContent: 0x3,
    attachmentMeta: 0x4,
    attachmentContent: 0x5,
    done: 0x6
};

function parse(input, logger) {
    var lines = input.split(/\r?\n/);
    var data = {
        state: STATES.init,
        boundary: "",
        soap: {},
        attachments: []
    };

    for (var i in lines) {
        processLine(lines[i], logger, data);
    }

    delete data.currentAttachment;
    data.state = STATES.done;

    return data;
}

function processLine(line, logger, data) {
    switch (data.state) {
        case STATES.init:
            if (line.startsWith("--MIMEBoundary")) {
                data.boundary = line;
                data.state = STATES.soapMeta;
            }
            break;
        case STATES.soapMeta:
            // soap content should start after the first empty line
            if (!line) {
                data.soap.content = "";
                data.state = STATES.soapContent;
            }
            // if line starts with --MIMEBoundary, the message is malformed
            else if (line.startsWith("--MIMEBoundary")) {
                logger.error("Invalid XDR message");
                data = {};
                return;
            }
            // any line between --MIMEBoundary and the first empty line goes into soap meta
            else {
                //TODO validation goes here
                data.soap.meta = data.soap.meta || {};
                var i = line.indexOf(":");
                if (i !== -1) {
                    var key = line.substring(0, i);
                    var value = line.substring(i + 1);
                    data.soap.meta[key] = value.trim();
                }
            }
            break;
        case STATES.soapContent:
            if (line === data.boundary) {
                data.state = STATES.attachmentMeta;
            } else {
                if (line) {
                    // data.soap.content += line.trim() + " ";
                    data.soap.content += line + "\r\n";
                // } else {
                    // data.soap.content += " ";
                }
            }
            break;
        case STATES.attachmentMeta:
            // attachment content should start after the first empty line
            if (!line) {
                data.currentAttachment.content = "";
                data.state = STATES.attachmentContent;
            }
            // if line starts with --MIMEBoundary, the message is malformed
            else if (line.startsWith("--MIMEBoundary")) {
                logger.error("Invalid XDR message");
                data = {};
                return;
            }
            // any line between --MIMEBoundary and the first empty line goes into attachment meta
            else {
                //TODO validation goes here
                data.currentAttachment = data.currentAttachment || {};
                data.currentAttachment.meta = data.currentAttachment.meta || {};
                var i = line.indexOf(":");
                if (i !== -1) {
                    var key = line.substring(0, i);
                    var value = line.substring(i + 1);
                    data.currentAttachment.meta[key] = value.trim();
                }
            }
            break;
        case STATES.attachmentContent:
            if (line === data.boundary + "--") {
                data.attachments.push(data.currentAttachment);
                data.currentAttachment = {};
                data.state = STATES.done;
            } else if (line === data.boundary) {
                data.attachments.push(data.currentAttachment);
                data.currentAttachment = {};
                data.state = STATES.attachmentMeta;
            } else {
                // data.currentAttachment.content += line.trim();
                data.currentAttachment.content += line + "\r\n";
            }
            break;
    }
}

//-----------------

module.exports = {
    parse: parse
};