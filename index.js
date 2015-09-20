var fs = require('fs');
var nickmoo = new (require('./lib/nickmoo'))(JSON.parse(fs.readFileSync('config.json')));

nickmoo.init();
