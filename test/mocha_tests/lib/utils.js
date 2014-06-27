var ENABLE_LOG = false;

module.exports = {
    logMessage: function () {
        if (ENABLE_LOG)
            console.log.apply(this, arguments);
    },
    logError: function () {
        if (ENABLE_LOG)
            console.error.apply(this, arguments);
    }
};