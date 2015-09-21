// NML VM
// Runs NML AST, stored in a MObject
// A VM would exist for each script/verb, and would be reset/replaced with a
// new VM when those scripts/verbs are updated/edited.

var VM = function(app, mobj, ast) {
  this._app = app;
  this.mobj = mobj; // MOO Object

  // Initialize the state
  this.state = {
    ast: ast,
    localVars: {},
    ip: [0] // Instruction pointer/path; this is an array as the AST is a tree with many levels
            // Example: [2, 4, 10] for the second object, then fourth, then tenth object
  }
}

VM.findIns = function(ip, ast) {
  if(ast === undefined) ast = this.state.ast;

  // Find the instruction specified by instruction path IP
  if(ip.length <= 1) {
    return ast[ip[0]];
  } else {
    if(typeof(ast[ip[0]]) === 'object') {
      return VM.findIns(ip.slice(1, ip.length), ast[ip[0]].block);
    } else {
      return ast; // Path not valid, just return the ast at it's current state
    }
  }
}

VM.prototype.stepOnce = function() {
  // First find the Instruction
  var ins = VM.findIns(this.state.ip, this.state.ast); // _that was easy_
  switch(ins.type) {
    case 'while':
      break;
    case 'if':
      break;
    case 'assign':
      break;
    case 'verbcall':
      break;
  }
}

VM.prototype.step = function(times) {
  for(var i = 0; i < times; i++) this.stepOnce();
}

module.exports = VM;
