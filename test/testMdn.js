var fs = require('fs');

var logger = require('../logger.js');
var mdn = require('../lib/mdn.js');

logger.info("Starting encrypt test...");

mdn.buildMdn('a@direct', 'b@ett', '325907728.42305.1512919590946@ip-172-31-38-17134444444444444444444444', 'subject', 'processed', function(err, mdnMessage) {
    if(err) {
        console.error('Error: ' + err);
        return;
    }

    console.log(mdnMessage);
});

