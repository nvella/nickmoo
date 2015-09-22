var readline = require('readline');
var P = require('./lib/nml/parser');
var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
var util = require('util');

var buffer = '';

function p(obj) {
  console.log(util.inspect(obj, {depth: 16, colors: true}));
}

function runCode(code) {
  console.log('----');
  //try {
    p(P.codeToAst(code));
  //} catch(err) {
    //console.log('Syntax error\n'+err);
  //}
}

function doPrompt() {
  rl.question('>', function(input) {
    if(input.trim() == '.run') {
      runCode(buffer);
      buffer = '';
    } else {
      buffer += input + "\n";
    }
    doPrompt();
  });
}

doPrompt();
