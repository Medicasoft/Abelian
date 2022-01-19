var fs = require('fs');

var logger = require('../logger.js');
var smime = require('../smime.js');

logger.info("Starting encrypt test...");

var stream = fs.createReadStream('./test/message.mime');
smime.encrypt(stream, 'maria.roditis@direct.mu.medicasoft.us', 'd9@domain1.dcdt31prod.sitenv.org', logger, function(err, outStream) {
    if(err) {
        console.error('Error: ' + err);
        return;
    }

    var fileStream = fs.createWriteStream('./outSmime.txt', {encoding: 'utf8'});
    fileStream.on('close', function() {
        console.log('CLOSE!');
    });
    fileStream.on('end', function() {
        console.log('END!');
    });
    outStream.pipe(fileStream);
});