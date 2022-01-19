var mdncheck = require('../mdncheck.js');

mdncheck.moveMessage('id', 'from', 'dispatched', function(err) {
    if(err) {
        console.error('Error: ' + err);
        return;
    }
});

