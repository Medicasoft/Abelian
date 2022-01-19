var os = require('os');
var path = require('path');

var config = {};

config.mdnTimeout = 10000; //milliseconds
config.authorExternalClassificationUID = 'urn:uuid:a7058bb9-b4e4-4307-ba5b-e3f0ab85e12d';

config.logging = {};
config.logging.folder = './output/';
config.logging.mdnFolder = './output/log/'; //base path for MDN messages
//new, processed, done subfolders must exist

config.rest = {};
//port - used to listen on localhost:<port>
config.rest.port = 8085;
//baseUrl - public Abelian API URL to be included in Location: header and in bundles (port may be missing or different by localhost service port)
config.rest.baseUrl = "http://localhost:" + config.rest.port + "/";
if(!/\/$/.test(config.rest.baseUrl)) { //ensure it ends with '/'
    config.rest.baseUrl += '/';
}
config.rest.connString = "/tmp maildb";
//config.rest.connString = "mysql://direct:PASSWORDHERE@localhost/maildb";
//paging for resource search
config.rest.pageSize = 10;
//maximum time allowed for message processing (in seconds); after this, processing is considered to have failed and the message is available again
config.rest.maxMessageProcessingTime = 60;

// START: SMTP SETTINGS - REVIEW
// SMTP SETTINGS - REVIEW - NOT USED
/* config.smtp = {};
config.smtp.host = 'direct.mu.medicasoft.us';
config.smtp.port = 25; //others: 2525, 587, 465, 2526
config.smtp.user = 'edgetest';
config.smtp.pass = 'passwd'; */

// config.smtp = {};
// config.smtp.host = 'localhost';
// config.smtp.port = 2525; //others: 2525, 587, 465, 2526
// config.smtp.user = 'edgetest';
// config.smtp.pass = 'passwd';

// NEW SMTP SETTINGS - REVIEW

//open this SMTP interface
config.smtpLocalServer = {};
config.smtpLocalServer.port = 2500;

//SMTP server to send encrypted/decrypted messages to
config.smtpTargetServer = {};
config.smtpTargetServer.host = '127.0.0.1';
config.smtpTargetServer.port = 2501;

// END: SMTP SETTINGS

config.pathToCertificateString = os.tmpdir();

// config.capath = '/var/spool/direct/ca';
config.capath = './ca';
config.opensslPath = '/opt/openssl-1.0.2m/install/openssl'; //use custom openssl installation

// localDomainsToSendDispatchedFor
// For the following local domains, send dispatched MDN. (Default = no dispatched MDN sent for local domains)
// NOTE: Ensure the domains in this key are not used by running NXT EHR/PHR servers.
//       If the domain is already connected with a running NXT EHR/PHR, the NXT system itself sends dispatched MDN.
//
// config.localDomainsToSendDispatchedFor = ['direct.medicasoft.us'];

config.ldapQueryMaxRetryTimes = 20;
// HTTPS certificates for the XDR Server
config.key = __dirname + '/cert/key.pem';
config.cert = __dirname + '/cert/cert.pem';

config.destinations = {
    'xdrtest10@direct.mu.medicasoft.us': {
        type: 'xdr',
        xdrType: 'minimal', // 'minimal'/'XDS' (defaults to 'minimal')
        endpoint: 'https://ttpedge.sitenv.org:11084/xdstools/sim/edge-ttp__10/rep/xdrpr'
    },
    'xdrtest11@direct.mu.medicasoft.us': {
        type: 'xdr',
        xdrType: 'minimal',
        endpoint: 'https://ttpedge.sitenv.org:11084/xdstools/sim/edge-ttp__11/rep/xdrpr'
    },
    'xdrtest12@direct.mu.medicasoft.us': {
        type: 'xdr',
        xdrType: 'XDS',
        endpoint: 'https://ttpedge.sitenv.org:11084/xdstools/sim/edge-ttp__12/rep/xdrpr'
    },
    'xdrmttest13@direct.mu.medicasoft.us': {
        type: 'xdr',
        xdrType: 'minimal',
        endpoint: 'https://ttpedge.sitenv.org:11084/xdstools/sim/edge-ttp__32mu2/rep/xdrpr'
    },
    'xdrmttest14@direct.mu.medicasoft.us': {
        type: 'xdr',
        xdrType: 'minimal',
        endpoint: 'https://ttpedge.sitenv.org:11084/xdstools/sim/edge-ttp__33mu2/rep/xdrpr'
    },
    'xdrmttest15@direct.mu.medicasoft.us': {
        type: 'xdr',
        xdrType: 'minimal',
        endpoint: 'https://ttpedge.sitenv.org:11084/xdstools/sim/edge-ttp__34mu2/rep/xdrpr'
    },
    'xdrtest16@direct.mu.medicasoft.us': {
        type: 'xdr',
        xdrType: 'minimal',
        endpoint: 'https://ttpedge.sitenv.org:11084/xdstools/sim/edge-ttp__16/rep/xdrpr' // Mutual TLS verify
    },
    'xdrmttest16@direct.mu.medicasoft.us': {
        type: 'xdr',
        xdrType: 'minimal',
        endpoint: 'https://ttpedge.sitenv.org:11084/xdstools/sim/edge-ttp__35mu2/rep/xdrpr'
    },
    'xdrtest17@direct.mu.medicasoft.us': {
        type: 'xdr',
        xdrType: 'minimal',
        endpoint: '' // Server provided certificate is invalid
    },
    'xdrmttest36@direct.mu.medicasoft.us': {
        type: 'xdr',
        xdrType: 'minimal',
        endpoint: 'https://ttpedge.sitenv.org:11084/xdstools/sim/edge-ttp__36mu2/rep/xdrpr'
    },
    'xdrmttest37@direct.mu.medicasoft.us': {
        type: 'xdr',
        xdrType: 'minimal',
        endpoint: 'https://ttpedge.sitenv.org:11084/xdstools/sim/edge-ttp__37mu2/rep/xdrpr'
    },
    'xdrmttest38@direct.mu.medicasoft.us': {
        type: 'xdr',
        xdrType: 'minimal',
        endpoint: 'https://ttpedge.sitenv.org:11084/xdstools/sim/edge-ttp__38mu2/rep/xdrpr'
    },
    'xdrmttest43@direct.mu.medicasoft.us': {
        type: 'xdr',
        xdrType: 'minimal',
        endpoint: 'https://ttpedge.sitenv.org:11084/xdstools/sim/edge-ttp__43mu2/rep/xdrpr'
    },
    'xdrmttest44@direct.mu.medicasoft.us': {
        type: 'xdr',
        xdrType: 'minimal',
        endpoint: 'https://ttpedge.sitenv.org:11084/xdstools/sim/edge-ttp__44mu2/rep/xdrpr'
    },
    'edge-receiver@ttpds.sitenv.org': {
        type: 'smtp',
        username: 'vendoraccount@ttpds.sitenv.org',
        password: 'vendortesting123'
    }
    //local addresses will be added from CAPATH/<domain_name> - to deliver messages to db
};

config.xdrServer = {};
config.xdrServer.host = 'https://direct.mu.medicasoft.us';
config.xdrServer.port = 3500;
config.xdrServer.path = '';

config.soapSchema = __dirname + '/input/soap_schema.xsd';

config.constants = {};
config.constants.patient = {};
config.constants.patient.patientId = '1^^^&amp;2.16.840.1.113883.4.6&amp;ISO';
config.constants.patient.name = 'Jones^Isabella^^^^';
config.constants.patient.birthDate = '19470501';
config.constants.patient.sex = 'F';
config.constants.patient.address = '1357 Amber Drive^^Beaverton^OR^97006^';

config.constants.stableDocumentEntry = 'urn:uuid:7edca82f-054d-47f2-a032-9b2a5b5186c1';
config.constants.registryPackageType = 'urn:uuid:a54d6aa5-d40d-43f9-88c5-b4633d873bdd';

module.exports = config;
