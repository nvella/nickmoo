// NML VM
// Runs NML AST, stored in a MObject
// A VM would exist for each script/verb, and would be reset/replaced with a
// new VM when those scripts/verbs are updated/edited.

var OPERATORS = ['+', '-', '/', '*'];
var TYPE_COMPATIBILITY = {
  '+': {
    'number': ['string', 'number'],
    'string': ['string'],
    'array': ['string'],
    'null': ['string']
  },
  '-': {
    'number': ['number'],
    'string': [],
    'array': [],
    'null': []
  },
  '*': {
    'number': ['number'],
    'string': [],
    'array': [],
    'null': []
  },
  '/': {
    'number': ['number'],
    'string': [],
    'array': [],
    'null': []
  }
}

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

var err = function(str) {
  throw 'runtime error: ' + str;
}

// Resolve possible indirect values, like variables, properties, etc
VM.prototype.resolveValue = function(value) {
  if(typeof(value) !== 'object') return value; // This is a direct value, just return it.
  switch(value.type) {
    case 'var': // Local variable, return it from our state.
      return this.state.localVars[value.name];
    case 'prop': // This is a property, fetch it from the object
      return this.mobj.getProp(value.name);
    case 'objectIdAlias': // This is an object id alias, ask the app for what it means
      return this._app.resolveObjIdAlias(value.value);
    default:
      return null;
  }
}

// Evaluate simple expresisons, like 4 * 5
VM.prototype.evalExpr = function(expr) {
  // First, if the second component is not an operator and the whole expression
  // has no JS objects/hashes, then just return the expression joined by space
  if(OPERATORS.indexOf(expr[1]) < 0) {
    var noObjects = true;
    for(var obj of expr) { if(typeof(obj) === 'object') { noObjects = false; break; }}
    if(noObjects) return expr.join(' ');
  }

  // Loop over every component in the expression
  // Every second component is an operator (+ - / *)
  var output = null;
  for(var i = 0; i < expr.length; i += 2) {
    if(i > 0) {
      var op = expr[i - 1];
      if(OPERATORS.indexOf(op) < 0) err(op + ' is not a valid operator (+ - / *)');
      if(TYPE_COMPATIBILITY[op][typeof(expr[i])].indexOf(typeof(output)) < 0) err('type ' + typeof(expr[i]) + ' cannot be opped ' + op + ' with ' + typeof(output));
      switch(op) {
        case '+':
          output += this.resolveValue(expr[i]);
          break;
        case '-':
          output -= this.resolveValue(expr[i]);
          break;
        case '/':
          output /= this.resolveValue(expr[i]);
          break;
        case '*':
          output *= this.resolveValue(expr[i]);
          break;
      }
    } else {
      // We can't run any operators, just set the output to the first component
      output = this.resolveValue(expr[i]);
    }
  }
  return output;
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
