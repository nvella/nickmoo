var util = require('util');

function p(obj) {
  console.log(util.inspect(obj, {depth: 16, colors: true}));
}

module.exports = p;
