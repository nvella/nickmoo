// NML VM
// Runs NML AST, stored in a MObject
// A VM would exist for each script/verb, and would be reset/replaced with a
// new VM when those scripts/verbs are updated/edited.

var async = require('async');

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
// Async because it _might_ hit the DB
VM.prototype.resolveValue = function(value, callback) {
  if(typeof(value) !== 'object') return callback(null, value); // This is a direct value, just return it.
  switch(value.type) {
    case 'var': // Local variable, return it from our state.
      return callback(null, this.state.localVars[value.name]);
    case 'prop': // This is a property, fetch it from the object
      return this.mobj.getProp(value.name, callback);
    case 'objectIdAlias': // This is an object id alias, ask the app for what it means
      return callback(null, this._app.resolveObjIdAlias(value.value));
    default:
      return callback(null, null);
  }
}

// Evaluate simple expresisons, like 4 * 5
// Async because resolveValue _might_ hit the DB
VM.prototype.evalExpr = function(expr, callback) {
  // First, if the second component is not an operator and the whole expression
  // has no JS objects/hashes, then just return the expression joined by space
  if(OPERATORS.indexOf(expr[1]) < 0) {
    var noObjects = true;
    for(var obj of expr) { if(typeof(obj) === 'object') { noObjects = false; break; }}
    if(noObjects) return callback(null, expr.join(' '));
  }

  // Loop over every component in the expression
  // Every second component is an operator (+ - / *)
  var output = null;
  var parseNextComponent = function(i) {
    if(i >= expr.length) {
      callback(null, output);
    } else if(i > 0) {
      var op = expr[i - 1];
      this.resolveValue(expr[i], function(err, value) {
        if(err) return callback(err);
        if(OPERATORS.indexOf(op) < 0) return callback(op + ' is not a valid operator (+ - / *)');
        if(TYPE_COMPATIBILITY[op][typeof(value)].indexOf(typeof(output)) < 0) return callback('type ' + typeof(value) + ' cannot be opped ' + op + ' with ' + typeof(output));
        switch(op) {
          case '+':
            output += value;
            return parseNextComponent(i + 2);
          case '-':
            output -= value;
            return parseNextComponent(i + 2);
          case '/':
            output /= value;
            return parseNextComponent(i + 2);
          case '*':
            output *= value;
            return parseNextComponent(i + 2);
        }
      }.bind(this));
    } else {
      this.resolveValue(expr[i], function(err, value) {
        output = value;
        parseNextComponent(i + 2);
      });
    }
  }.bind(this);

  parseNextComponent(0);
}

VM.prototype.stepOnce = function(callback) {
  // First find the Instruction
  var ins = VM.findIns(this.state.ip, this.state.ast); // _that was easy_

  // Finishes job by incrementing the IP accordingly
  var jobDone = function(err, results) {
    if(err) return callback(err);
    // TODO increment IP
    callback();
  }.bind(this);

  switch(ins.type) {
    case 'while':
      break;
    case 'if':
      break;
    case 'assign':
      async.waterfall([
      function(c) { this.evalExpr(ins.src, c); }.bind(this),
      function(value, c) {
        if(ins.op === '=') {
          // Simple assignment
          if(ins.dst.type === 'var') {
            // Local variable, just set it here
            this.state.localVars[ins.dst.name] = value;
            c();
          } else if(ins.dst.type === 'prop') {
            // Object prop, set it and pass it the stepOnce callback.
            this.mobj.setProp(ins.dst.name, value, c);
          } else {
            c();
          }
        } else {
          // Complex assignment, runs an expression.

        }
      }.bind(this)], jobDone);
      break;
    case 'verbcall':
      break;
  }
}

VM.prototype.step = function(times, callback) {
  async.times(times, function(i, next) {
    this.stepOnce(next);
  }.bind(this), callback);
}

module.exports = VM;
