// NML VM
// Runs NML AST, stored in a MObject
// A VM would exist for each script/verb, and would be reset/replaced with a
// new VM when those scripts/verbs are updated/edited.

var async = require('async');

var OPERATORS          = require('./constants').OPERATORS;
var TYPE_COMPATIBILITY = require('./constants').TYPE_COMPATIBILITY;

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
  if(value instanceof Array) return this.evalExpr(value, callback);
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
  // UNLESS, the first component is a number
  if(OPERATORS[expr[1]] === undefined && typeof(expr[0]) !== 'number') {
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
      // Resolve the value so the correct value is used for the type checking
      this.resolveValue(expr[i], function(err, value) {
        if(err) return callback(err);
        if(OPERATORS[op] === undefined) return callback(op + ' is not a valid operator (' + Object.keys(OPERATORS).join(' ') + ')');
        if(TYPE_COMPATIBILITY[op] !== undefined && TYPE_COMPATIBILITY[op][typeof(value)].indexOf(typeof(output)) < 0) return callback('type ' + typeof(value) + ' cannot be opped ' + op + ' with ' + typeof(output));
        output = OPERATORS[op](output, value);
        return parseNextComponent(i + 2);
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
    // If this is a branching instruction and we need to branch (results[0]),
    // branch instead of incrementing the IP
    if((ins.type === 'if' || ins.type === 'while') && results[0] && ins.block.length > 0) {
      this.state.ip.push(0); // This simply bumps us into the next instruction to the right on the AST
    } else {
      // Otherwise, we need to decide what to do

      // While we are at the end of the current block (if we are)
      while(this.state.ip.length > 1 &&
            this.state.ip.slice(-1)[0] ===
            VM.findIns(this.state.ip.slice(0, -1)).block.length - 1) {
        if(VM.findIns(this.state.ip.slice(0, -1)).type === 'while') {
          // TODO Consider looping around
        } else { // Probably an if statement, just pop off the stack
          this.state.ip.pop(); // Pop off the current state
        }
      }

      // Are we at the end of the script
      if(this.state.ip.length === 1 && this.state.ip[0] === this.state.ast.length - 1)
        return callback('endOfScript'); // Error with endOfScript

      // Carry on, increment by one
      this.state.ip[this.state.ip.length - 1]++;
    }
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
      function(value, c) { // We have evaluated the right side of the assignment, set the value.
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
            c('unspecifiable error (cac96aa5-fade-4263-a56c-e4cd883447cc)');
          }
        } else {
          // Complex assignment, runs an expression.
          // We need to resolve the dst so we can type check
          this.resolveValue(ins.dst, function(err, currentValue) {
            if(TYPE_COMPATIBILITY[ins.op][typeof(value)].indexOf(typeof(currentValue)) < 0) return c('type ' + typeof(value) + ' cannot be opped ' + ins.op + ' with ' + typeof(currentValue));
            // It's all valid, do the assignment
            currentValue = OPERATORS[ins.op](currentValue, value);
            // Set currentValue back to where it came from
            if(ins.dst.type === 'prop') {
              this.mobj.setProp(ins.dst.name, currentValue, c);
            } else if(ins.dst.type === 'var') {
              this.state.localVars[ins.dst.name] = currentValue;
              return c();
            } else {
              return c('unspecifiable error (13041b5b-7392-400d-9623-44347db5f81e)');
            }
          }.bind(this));
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
