module.exports.getDomain = function (address) {
    return address.toLowerCase().split('@')[1];
};