var nm = require('nodemailer');

var config = require('../config.js');

var smtp = nm.createTransport({
    host: config.smtpTargetServer.host,
    port: config.smtpTargetServer.port,
    secure: false,
    authOptional: true,
    tls: { rejectUnauthorized: false },
    ignoreTLS: true
});

module.exports.sendMail = smtp.sendMail;