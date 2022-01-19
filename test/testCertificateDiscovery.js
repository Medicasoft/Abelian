var parseArgs = require('minimist');
var argv = parseArgs(process.argv.slice(2), { string: ["a", "d"] });
var certificateDiscovery =  require('../certificateParser/certificateDiscovery.js');
var logger = require('./testLogger.js');

var help = "Usage: \n\t-a <address> \t Address to find certificate for" +
    "\n\t-d <domain>\t Local DIRECT domain (trust anchors)";

if (argv._.length > 0 || !argv.a || !argv.d) { console.log(help); process.exit(1); }

var address = argv.a;
var domain = argv.d;

certificateDiscovery.findCertificate(address, domain, logger, function(err, foundCert) {
    if(err) {
        console.error(err);
        process.exit(1);
    }

    console.log(foundCert);
    console.log('END');
});