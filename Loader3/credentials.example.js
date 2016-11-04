var atob = require('atob');

var Credentials = {}

Credentials.username = "XY";
Credentials.password = "AB";
Credentials.base64all = atob(Credentials.username + ":" + Credentials.password);

module.exports = Credentials;