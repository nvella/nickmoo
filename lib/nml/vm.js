// NML VM
// Runs NML AST, stored in a MObject
// A VM would exist for each script/verb, and would be reset/replaced with a
// new VM when those scripts/verbs are updated/edited.

var async = require('async');

var OPERATORS          = require('./constants').OPERATORS;
var TYPE_COMPATIBILITY = require('./constants').TYPE_COMPATIBILITY;
var OP_ORDER           = require('./constants').OP_ORDER;

var EndOfScriptError = require('./errors').EndOfScriptError;

var VM = function(app, mobj, ast) {
  this._app = app;
  this.mobj = mobj; // MOO Object

  // Initialize the state
  this.state = {
    ast: ast,
    localVars: {},
    ip: [0] // Instruction pointer/path; this is an array as the AST is a tree with many levels
            // Example: [2, 4, 10] for the second object, then fourth, then tenth object
  };

  // When a verb is called, this will be set to another VM instance for that verb
  // When the VM's state needs to be saved, this will have to be serialized.
  this.subVm = null;
  // Store callbacks here so the end of a subvm's execution can resume the previous step
  this._endResolveCallback = null;
  this._endStepCallback = null;
};

VM.findIns = function(ip, ast) {
  // Find the instruction specified by instruction path IP
  if(ip.length <= 1) {
    return ast[ip[0]];
  } else {
    if(typeof(ast[ip[0]]) === 'object' && ast[ip[0]].block !== undefined) {
      return VM.findIns(ip.slice(1, ip.length), ast[ip[0]].block);
    } else {
      return ast; // Path not valid, just return the ast at it's current state
    }
  }
};

// NML type array
var traverseArray = function(arr, path) {
  if(path.length <= 1) {
    return arr.ctx[path[0] || 0];
  } else {
    return traverseArray(arr.ctx[path[0]], path.slice(1, path.length));
  }
};

var traverseArrayAndSet = function(arr, path, value) {
  if(path.length <= 1) {
    arr.ctx[path[0] || 0] = value;
    return arr.ctx[path[0] || 0];
  } else {
    return traverseArray(arr.ctx[path[0]], path.slice(1, path.length));
  }
};

// Resolve possible indirect values, like variables, properties, etc
// Async because it _might_ hit the DB
VM.prototype.resolveValue = function(value, callback) {
  if(typeof(value) !== 'object') return callback(null, value); // This is a direct value, just return it.
  if(value instanceof Array) { // Not arrays, expression groups. Arrays are {type: 'array', ...}
    // If the array has a single item, return that instead of the whole array
    // This helps collapse expressions for evalExpr
    if(value.length === 1) return this.evalExpr(value[0], callback);
    return this.evalExpr(value, callback);
  }
  switch(value.type) {
    case 'var': // Local variable, return it from our state.
      // Return an element of the array if provided with an index
      if(value.ctx) {
        if(typeof(this.state.localVars[value.name]) !== 'object' || this.state.localVars[value.name].type !== 'array') return callback(new Error('attempted to index nonindexable local var'));
        return callback(null, traverseArray(this.state.localVars[value.name], value.ctx));
      }
      return callback(null, this.state.localVars[value.name]);
    case 'prop': // This is a property, fetch it from the object
      // Return an element of the array if provided with an index
      if(value.ctx) return this.mobj.getProp(value.name, function(err, val) {
        if(err) return callback(err);
        if(typeof(val) !== 'object' || val.type !== 'array') return callback(new Error('attempted to index nonindexable object prop'));
        return callback(null, traverseArray(val, value.ctx));
      });
      return this.mobj.getProp(value.name, callback);
    case 'verbcall': // This is a verbcall
      this.mobj.verbcall(value, function(err, newVm) {
        if(err) return callback(err);
        this._endResolveCallback = callback; // The endResolve callback is only called once the script in the VM is done.
        this.subVm = newVm; // Set the subVm
        return this._endStepCallback(null); // Call the endStep callback.
      }.bind(this));
      return;
    default: // This may be an object like a virtual null, just pass it through
      return callback(null, value);
  }
};

// Evaluates expressions, which can include anything including verbcalls
// Async because resolveValue _might_ hit the DB
VM.prototype.evalExpr = function(expr, finalCallback) {
  expr = expr.slice(); // Shallow copy expr, as we will be modifying it
  // First, if the second component is not an operator and the whole expression
  // has no JS objects/hashes, then just return the expression joined by space
  // UNLESS, the first component is a number
  if(OPERATORS[expr[1]] === undefined && typeof(expr[0]) !== 'number') {
    var noObjects = true;
    for(var obj of expr) { if(typeof(obj) === 'object') { noObjects = false; break; }}
    if(noObjects) return finalCallback(null, expr.join(' '));
  }

  var parseAllOps = function(opTypeIndex) {
    var nextOpType = function() {
      if(opTypeIndex + 1 >= OP_ORDER.length || expr.length < 2) {
        finalCallback(null, expr[0]); // The result should be the only thing remaining
                                      // in the expression.
      } else {
        parseAllOps(opTypeIndex + 1);
      }
    }.bind(this);
    var op = OP_ORDER[opTypeIndex];

    var nextOp = function() { // We shouldn't need an index of where to search
                              // for the next op if we delete the op and replace
                              // it with it's result
      var opIndex = expr.indexOf(op);
      if(opIndex === -1) return nextOpType(); // Find the next op type if there is no more of this op type
      async.map([expr[opIndex-1], expr[opIndex+1]], this.resolveValue.bind(this), function(err, results) {
        if(err) return finalCallback(err);
        // We have our resolved results in the results array, left = [0], right = [1]
        var left = results[0], right = results[1];
        // Check types
        if(TYPE_COMPATIBILITY[op] !== undefined && TYPE_COMPATIBILITY[op][typeof(right)].indexOf(typeof(left)) < 0) return finalCallback(new Error('type ' + typeof(left) + ' cannot be opped ' + op + ' with ' + typeof(right)));
        // Splice out the op and the right side from the expression
        expr.splice(opIndex, 2);
        // Set the opIndex - 1 (left side which is still intact) to the result
        expr[opIndex - 1] = OPERATORS[op](left, right);
        // Find the next op of this type
        nextOp();
      }.bind(this));
    }.bind(this);

    nextOp();
  }.bind(this);

  parseAllOps(0);
};

VM.prototype.stepOnce = function(callback) {
  // Set the step callback
  // This is required for a subVm completion, it needs to be able to call the correct callback and not one brought in through closure scope.
  this._endStepCallback = callback;

  // First, if a subvm is set, delegate execution to that
  if(this.subVm !== null) {
    this.subVm.stepOnce(function(err) {
      if(err) {
        this.subVm = null;
        return this._endResolveCallback(null, err); // TODO, Call with the return value of the vm once implemented
      } else {
        callback(null);
      }
    }.bind(this));
    return;
  }

  // Set the resolve callback to null, it'll be set once a verbcall is kicked off
  this._endResolveCallback = null;

  // Find the Instruction
  var ins = VM.findIns(this.state.ip, this.state.ast); // _that was easy_

  // Finishes job by incrementing the IP accordingly
  var jobDone = function(err, results, callback) {
    if(err) return callback(err);
    // If this is a branching instruction and we need to branch (results[0]),
    // branch instead of incrementing the IP
    if((ins.type === 'if' || ins.type === 'while') && results && ins.block.length > 0) {
      this.state.ip.push(0); // This simply bumps us into the next instruction to the right on the AST
      return callback(null);
    } else {
      // Otherwise, we need to decide what to do
      var progressIP = function() {
        // While we are at the end of the current block (if we are)
        while(this.state.ip.length > 1 &&
              this.state.ip.slice(-1)[0] ===
              VM.findIns(this.state.ip.slice(0, -1), this.state.ast).block.length - 1) {
          if(VM.findIns(this.state.ip.slice(0, -1), this.state.ast).type === 'while') {
            // Consider looping around
            // Reevaluate the condition and if it is true, go back to the top of
            // the loop (set ip[ip.length - 1] = 0)
            // Otherwise pop off the path from ip
            this.evalExpr(VM.findIns(this.state.ip.slice(0, -1), this.state.ast).expr, function(err, value) {
              if(err) return callback(err); // If we couldn't eval the expression, error
              if(value) {
                // Restart loop
                this.state.ip[this.state.ip.length - 1] = 0;
                return callback(null);
              } else {
                // Pop off the current state to return to where we were
                this.state.ip.pop(); // Pop off the current state

                return progressIP(); // This runs through the whole escape block loop again
              }
            }.bind(this));
            return;
          } else { // Probably an if statement, just pop off the stack
            this.state.ip.pop(); // Pop off the current state
          }
        }

        // Are we at the end of the script
        if(this.state.ip.length === 1 && this.state.ip[0] === this.state.ast.length - 1)
          return callback(new EndOfScriptError()); // Error with endOfScript

        // Carry on, increment by one
        this.state.ip[this.state.ip.length - 1]++;
        callback(null); // Call the callback, everything is done
      }.bind(this);

      progressIP();
    }
  }.bind(this);

  switch(ins.type) {
    case 'while':
    case 'if':
      // while/if statement. Check if expression provided evaluates to true
      // and if so, callback with branch set to true
      this.evalExpr(ins.expr, function(err, value) {
        if(err) return jobDone(err, null, callback); // If we couldn't eval the expression, error
        var out = false;
        if(value) out = true; // Evaluate the expression using JS's if evaluation
        return jobDone(null, out, callback);
      });
      break;
    case 'assign':
      async.waterfall([
      function(c) { this.evalExpr(ins.src, c); }.bind(this),
      function(value, c) { // We have evaluated the right side of the assignment, set the value.
        if(ins.op === '=') {
          // Simple assignment
          if(ins.dst.type === 'var') {
            // Local variable, just set it here
            if(ins.dst.ctx !== undefined) {
              // Array index was provided, set this item in the array
              traverseArrayAndSet(this.state.localVars[ins.dst.name], ins.dst.ctx, value);
            } else {
              // Standard assignment
              this.state.localVars[ins.dst.name] = value;
            }
            c();
          } else if(ins.dst.type === 'prop') {
            // Object prop, set it and pass it the stepOnce callback.
            if(ins.dst.ctx !== undefined) {
              // Array index was provided, set this item in the array
              // We need to fetch the current array so we can modify it.
              this.mobj.getProp(ins.dst.name, function(err, arr) {
                traverseArrayAndSet(arr, ins.dst.ctx, value);
                this.mobj.setProp(ins.dst.name, arr, c);
              }.bind(this));
            } else {
              // Standard object property set
              this.mobj.setProp(ins.dst.name, value, c);
            }
          } else {
            c('unknown error (cac96aa5-fade-4263-a56c-e4cd883447cc)');
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
              return c('unknown error (13041b5b-7392-400d-9623-44347db5f81e)');
            }
          }.bind(this));
        }
      }.bind(this)], function(err) { jobDone(err, null, callback); });
      break;
    case 'verbcall':
      this.resolveValue(ins, function(err, value) { // Resolve the verbcall 'value', almost as-if it was an expression
        if(err) return callback(err); // There may of been an error in creating the verb, back out immediately
        // This (past this point) code is only called once the vm referenced by the verbcall has completed it's script.
        jobDone(null, null, this._endStepCallback);
      });
      break;
  }
};

VM.prototype.step = function(times, callback) {
  var loop = function(i) {
    this.stepOnce(function(err) {
      if(err) return callback(err);
      if(i < times - 1)
        return loop(i + 1);
      callback(null);
    });
  }.bind(this);

  loop(0);
};

module.exports = VM;
