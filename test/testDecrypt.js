var fs = require('fs');
var smime = require('../smime.js');

var stream = fs.createReadStream('./decryptSmime.txt');
smime.decrypt(stream, 'sender@domain.org', 'ccda@ttpedge.sitenv.org', function(err, outStream) {
    if(err) {
        console.error('Error: ' + err);
        return;
    }

    var fileStream = fs.createWriteStream('./outSmimeDecrypt.txt', {encoding: 'utf8'});
    fileStream.on('close', function() {
        console.log('CLOSE!');
    });
    outStream.pipe(fileStream);
});