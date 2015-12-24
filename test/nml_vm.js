var expect = require('chai').expect;
var NML = require('../lib/nml');
var MObject = require('../lib/mobject');
var async = require('async');
var MongoClient = require('mongodb').MongoClient;

var LOOP_MAX = 10000;

// Why is this here? I have no clue. It seems that the async library dislikes
// my VM with nested loops. Maybe too many stack levels? It works for all the
// other tests... I think...
function times(i, func, callback) {
  if(i <= 0) return callback(null);
  func(function(err) {
    if(err) return callback(err);
    return times(i - 1, func, callback);
  });
}

describe('NML.VM', function() {
  describe('findIns', function() {
    it('can find a top level instruction', function() {
      var ast = NML.Parser.codeToAst('$a = 2\nsay how are you');
      expect(NML.VM.findIns([1], ast).type).to.equal('verbcall');
    });

    it('can find a block', function() {
      var ast = NML.Parser.codeToAst('$a = 2\nsay how are you\n' +
        'if true\nsay test\nend');
      expect(NML.VM.findIns([2], ast).type).to.equal('if');
    });

    it('can find a nested instruction (inside block)', function() {
      var ast = NML.Parser.codeToAst('$a = 2\nsay how are you\n' +
        'if true\nsay test\nend');
      expect(NML.VM.findIns([2, 0], ast).type).to.equal('verbcall');
      expect(NML.VM.findIns([2, 0], ast).verb).to.equal('say');
      expect(NML.VM.findIns([2, 0], ast).params).to.eql(['test']);
    });

    it('can find a nested block (inside block)', function() {
      var ast = NML.Parser.codeToAst('$a = 2\nsay how are you\n' +
        'if true\nsay test\nif false\nsay lol\nend\nend');
      expect(NML.VM.findIns([2, 1], ast).type).to.equal('if');
      expect(NML.VM.findIns([2, 1], ast).expr).to.eql([false]);
    });

    it('can find an instruction nested in two blocks', function() {
      var ast = NML.Parser.codeToAst('$a = 2\nsay how are you\n' +
        'if true\nsay test\nif false\nsay lol\neat apple\nend\nend');
      expect(NML.VM.findIns([2, 1, 1], ast).type).to.equal('verbcall');
      expect(NML.VM.findIns([2, 1, 1], ast).verb).to.equal('eat');
      expect(NML.VM.findIns([2, 1, 1], ast).params).to.eql(['apple']);
    });
  });

  describe('#resolveValue', function() {
    it('passes through numbers', function(done) {
      var vm = new NML.VM();
      vm.resolveValue(4, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.equal(4);
        done();
      });
    });

    it('passes through booleans', function(done) {
      var vm = new NML.VM();
      vm.resolveValue(true, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.equal(true);
        done();
      });
    });

    it('passes through strings', function(done) {
      var vm = new NML.VM();
      vm.resolveValue('hello', function(err, value) {
        expect(err).to.be.null;
        expect(value).to.equal('hello');
        done();
      });
    });

    it('passes through a virtual null', function(done) {
      var vm = new NML.VM();
      vm.resolveValue({type: 'null', value: 'null'}, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.eql({type: 'null', value: 'null'});
        done();
      });
    });

    it('resolves a local variable', function(done) {
      var vm = new NML.VM();
      vm.state.localVars.myVar = 'foo bar';
      vm.resolveValue({type: 'var', name: 'myVar'}, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.eql('foo bar');
        done();
      });
    });

    it('resolves an object property', function(done) {
      var mobj = { getProp: function(name, callback) {
        expect(name).to.equal('myProp');
        expect(callback).to.not.be.null;
        callback(null, 42);
      }};
      var vm = new NML.VM(undefined, mobj);

      vm.resolveValue({type: 'prop', name: 'myProp'}, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.equal(42);
        done();
      });
    });

    it('resolves an array element on a local variable', function(done) {
      var vm = new NML.VM();
      vm.state.localVars.myVar = {type: 'array', ctx: ['apple', 'banana']};
      vm.resolveValue({type: 'var', name: 'myVar', ctx: [1]}, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.equal('banana');
        done();
      });
    });

    it('resolves an array element on an object property', function(done) {
      var mobj = { getProp: function(name, callback) {
        expect(name).to.equal('myProp');
        expect(callback).to.not.be.null;
        callback(null, {type: 'array', ctx: ['apple', 'banana']});
      }};
      var vm = new NML.VM(undefined, mobj);

      vm.resolveValue({type: 'prop', name: 'myProp', ctx: [1]}, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.equal('banana');
        done();
      });
    });

    it('can start resolution of a verbcall', function(done) {
      var subVm = new NML.VM();
      var mobj = {
        verbcall: function(value, cb) {
          expect(value).to.be.an('object');
          expect(value.type).to.equal('verbcall');
          expect(cb).to.be.a('function');
          cb(null, subVm);
        }
      };

      var vm = new NML.VM(null, mobj);

      vm._endStepCallback = function(err) {
        expect(err).to.be.null;
        expect(vm.subVm).to.equal(subVm);
        expect(vm._endResolveCallback).to.equal('END_RESOLVE_CALLBACK');
        done();
      };

      vm.resolveValue({type: 'verbcall',
        verb: 'verb1',
        directObj: null,
        prepos: null,
        indirectObj: null,
        params: []}, 'END_RESOLVE_CALLBACK');
    });

    it('throws an error when MObject#verbcall errors', function(done) {
      var mobj = { verbcall: function(value, cb) { cb(new Error('testError')); } };
      var vm = new NML.VM(null, mobj);

      vm._endStepCallback = function(err) {
        throw '_endStepCallback shouldn\'t of been called';
      };

      vm.resolveValue({type: 'verbcall',
        verb: 'verb1',
        directObj: null,
        prepos: null,
        indirectObj: null,
        params: []},
      function(err, newVm) {
        expect(err).to.be.an.instanceof(Error);
        expect(err.message).to.equal('testError');
        expect(vm.subVm).to.be.null;
        expect(newVm).to.be.undefined;
        done();
      });
    });

    it('throws an error when trying to index a nonindexable local var',
      function(done) {
      var vm = new NML.VM();
      vm.state.localVars.myVar = 'banana';
      vm.resolveValue({type: 'var', name: 'myVar', ctx: [1]}, function(err, value) {
        expect(err).to.be.a('error');
        expect(err.message).to.equal('attempted to index nonindexable local var');
        done();
      });
    });

    it('throws an error when trying to index a nonindexable object prop',
      function(done) {
      var mobj = { getProp: function(name, callback) {
        expect(name).to.equal('myProp');
        expect(callback).to.not.be.null;
        callback(null, 'banana');
      }};
      var vm = new NML.VM(undefined, mobj);

      vm.resolveValue({type: 'prop', name: 'myProp', ctx: [1]}, function(err, value) {
        expect(err).to.be.a('error');
        expect(err.message).to.equal('attempted to index nonindexable object prop');
        done();
      });
    });
  });

  describe('#evalExpr', function() {
    it('can evaluate a simple mathematical expression', function(done) {
      var vm = new NML.VM();
      vm.evalExpr([5, '+', 10], function(err, value) {
        expect(err).to.be.null;
        expect(value).to.equal(15);
        done();
      });
    });

    it('can evaluate a mathematical expression with groups taking priority',
      function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('5 + 10 * (6 + 4)'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.equal(5 + 10 * (6 + 4));
        done();
      });
    });

    it('follows the order of operations', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('5 + 5 * 2 + 10'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.equal(25);
        done();
      });
    });

    it('can evaluate a mathematical expression which references a local var',
      function(done) {
      var vm = new NML.VM();
      vm.state.localVars.myVar = 10;
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('5 + $myVar'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.equal(15);
        done();
      });
    });

    it('can evaluate a mathematical expression which references a local var ' +
      'in a group', function(done) {
      var vm = new NML.VM();
      vm.state.localVars.myVar = 10;
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('5 + ($myVar + 1)'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.equal(16);
        done();
      });
    });

    it('can evaluate a complex mathematical expression containing many nested' +
      'groups', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('5 + 5 * 2 + 10 * (16 + 2 * (4 + 3))'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.equal(315);
        done();
      });
    });

    it('can evaluate a simple boolean expression', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('10 == 10'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.be.true;
        done();
      });
    });

    it('can evaluate a simple boolean expression to be false', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('10 == 11'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.be.false;
        done();
      });
    });

    it('can evaluate an inverse boolean expression (!=)', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('10 != 11'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.be.true;
        done();
      });
    });

    it('can AND two expressions using the && operator', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('10 == 10 && 11 == 11'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.be.true;
        done();
      });
    });

    it('can AND two expressions using the and operator', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('10 == 10 and 11 == 11'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.be.true;
        done();
      });
    });

    it('can AND two expressions to be false', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('10 == 10 && 11 == 10'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.be.false;
        done();
      });
    });

    it('can OR two expressions using the || operator', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('10 == 10 || 11 == 10'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.be.true;
        done();
      });
    });

    it('can OR two expressions using the or operator', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('10 == 10 or 11 == 10'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.be.true;
        done();
      });
    });

    it('can OR two expressions to be false', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('10 == 11 || 11 == 10'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.be.false;
        done();
      });
    });

    it('can less-than two numbers to be true', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('5 < 10'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.be.true;
        done();
      });
    });

    it('can less-than two numbers to be false', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('10 < 5'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.be.false;
        done();
      });
    });

    it('can greater-than two numbers to be true', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('10 > 5'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.be.true;
        done();
      });
    });

    it('can greater-than two numbers to be false', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('5 > 10'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.be.false;
        done();
      });
    });

    it('can less-eql-than two numbers to be true', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('10 <= 10'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.be.true;
        done();
      });
    });

    it('can less-eql-than two numbers to be false', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('6 <= 5'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.be.false;
        done();
      });
    });

    it('can greater-eql-than two numbers to be true', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('5 >= 5'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.be.true;
        done();
      });
    });

    it('can greater-eql-than two numbers to be false', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('4 >= 5'));
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.be.false;
        done();
      });
    });

    it('can compare the value of a local var and a number to be true', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('$myVar < 5'));
      vm.state.localVars.myVar = 1;
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.be.true;
        done();
      });
    });

    it('can compare the value of a local var and a number to be false', function(done) {
      var vm = new NML.VM();
      var expr = NML.Parser.parseGroup(NML.Parser.parseLine('$myVar < 5'));
      vm.state.localVars.myVar = 10;
      vm.evalExpr(expr, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.be.false;
        done();
      });
    });
  });

  describe('#stepOnce', function() {
    it('throws an error at the end of the script', function(done) {
      var vm = new NML.VM();
      vm.state.ast = NML.Parser.codeToAst('$myVar = 4');
      vm.stepOnce(function(err) {
        expect(err).to.be.an.instanceof(NML.Errors.EndOfScriptError);
        done();
      });
    });

    it('can assign a local var', function(done) {
      var vm = new NML.VM();
      vm.state.ast = NML.Parser.codeToAst('$myVar = 4');
      vm.stepOnce(function(err) {
        expect(vm.state.localVars.myVar).to.equal(4);
        done();
      });
    });

    it('can assign a local var to an expression', function(done) {
      var vm = new NML.VM();
      vm.state.ast = NML.Parser.codeToAst('$myVar = 5 + 5 * 2 + 10 * (16 + 2 * (4 + 3))');
      vm.stepOnce(function(err) {
        expect(vm.state.localVars.myVar).to.equal(315);
        done();
      });
    });

    it('can assign an object property', function(done) {
      var vm = new NML.VM();
      vm.state.ast = NML.Parser.codeToAst('%myProp = 254');
      vm.mobj = {
        setProp: function(prop, value, callback) {
          expect(prop).to.equal('myProp');
          expect(value).to.equal(254);
          callback(null);
        }
      };
      vm.stepOnce(function(err) {
        expect(err).to.be.an.instanceof(NML.Errors.EndOfScriptError);
        done();
      });
    });

    it('can assign an object property to an expression', function(done) {
      var vm = new NML.VM();
      vm.state.ast = NML.Parser.codeToAst('%myProp = 5 + 5 * 2 + 10 * (16 + 2 * (4 + 3))');
      vm.mobj = {
        setProp: function(prop, value, callback) {
          expect(prop).to.equal('myProp');
          expect(value).to.equal(315);
          callback(null);
        }
      };
      vm.stepOnce(function(err) {
        expect(err).to.be.an.instanceof(NML.Errors.EndOfScriptError);
        done();
      });
    });

    it('can assign an array element of a local var', function(done) {
      var vm = new NML.VM();
      vm.state.localVars.myVar = {type: 'array', ctx: [1, 2, 3, 4]};
      vm.state.ast = NML.Parser.codeToAst('$myVar[1] = 99');
      vm.stepOnce(function(err) {
        expect(vm.state.localVars.myVar.ctx[1]).to.equal(99);
        done();
      });
    });

    it('can assign an array element of an object prop', function(done) {
      var vm = new NML.VM();
      vm.state.ast = NML.Parser.codeToAst('%myProp[1] = 99');
      vm.mobj = {
        setProp: function(prop, value, callback) {
          expect(prop).to.equal('myProp');
          expect(value).to.eql({type: 'array', ctx: [1, 99, 3, 4]});
          callback(null);
        },

        getProp: function(prop, callback) {
          expect(prop).to.equal('myProp');
          callback(null, {type: 'array', ctx: [1, 2, 3, 4]});
        }
      };
      vm.stepOnce(function(err) {
        done();
      });
    });

    it('can process a += operator-assignment', function(done) {
      var vm = new NML.VM();
      vm.state.localVars.myVar = 5;
      vm.state.ast = NML.Parser.codeToAst('$myVar += 5');
      vm.stepOnce(function(err) {
        expect(vm.state.localVars.myVar).to.equal(10);
        done();
      });
    });

    it('can process a -= operator-assignment', function(done) {
      var vm = new NML.VM();
      vm.state.localVars.myVar = 15;
      vm.state.ast = NML.Parser.codeToAst('$myVar -= 5');
      vm.stepOnce(function(err) {
        expect(vm.state.localVars.myVar).to.equal(10);
        done();
      });
    });

    it('can process a *= operator-assignment', function(done) {
      var vm = new NML.VM();
      vm.state.localVars.myVar = 5;
      vm.state.ast = NML.Parser.codeToAst('$myVar *= 5');
      vm.stepOnce(function(err) {
        expect(vm.state.localVars.myVar).to.equal(25);
        done();
      });
    });

    it('can process a /= operator-assignment', function(done) {
      var vm = new NML.VM();
      vm.state.localVars.myVar = 20;
      vm.state.ast = NML.Parser.codeToAst('$myVar /= 5');
      vm.stepOnce(function(err) {
        expect(vm.state.localVars.myVar).to.equal(4);
        done();
      });
    });

    it('can branch on an if statement evaluating to true', function(done) {
      var vm = new NML.VM();
      vm.state.ast = NML.Parser.codeToAst('if 5 == 5\n$i = 1\nend');
      vm.stepOnce(function(err) {
        expect(vm.state.ip).to.eql([0, 0]);
        done();
      });
    });

    it('can skip an if statement evaluating to false', function(done) {
      var vm = new NML.VM();
      vm.state.ast = NML.Parser.codeToAst('if 5 == 6\n$i = 1\nend\n$j = 2');
      vm.stepOnce(function(err) {
        expect(vm.state.ip).to.eql([1]);
        done();
      });
    });

    it('can return from an if statement at the end of the block',
      function(done) {
      var vm = new NML.VM();
      vm.state.ast = NML.Parser.codeToAst('if 5 == 5\n$i = 1\nend\n$i = 1');
      async.times(2, function(i, next) {
        vm.stepOnce(next);
      }, function(err) {
        expect(err).to.be.null;
        expect(vm.state.ip).to.eql([1]);
        done();
      });
    });

    it('can skip an if statement that evals to false at end the script',
      function(done) {
      var vm = new NML.VM();
      vm.state.ast = NML.Parser.codeToAst('if 5 == 6\n$i = 1\nend');
      vm.stepOnce(function(err) {
        expect(err).to.be.an.instanceof(NML.Errors.EndOfScriptError);
        expect(vm.state.ip).to.eql([0]);
        done();
      });
    });

    it('can error when returning from an if stmt placed at the end of script',
      function(done) {
      var vm = new NML.VM();
      vm.state.ast = NML.Parser.codeToAst('if 5 == 5\n$i = 1\nend');
      var lastIndex;
      async.times(2, function(i, next) {
        lastIndex = i;
        vm.stepOnce(next);
      }, function(err) {
        expect(err).to.be.an.instanceof(NML.Errors.EndOfScriptError);
        expect(vm.state.ip).to.eql([0]);
        expect(lastIndex).to.equal(1);
        done();
      });
    });

    it('can complete an if stmt with a body of multiple lines',
      function(done) {
      var vm = new NML.VM();
      vm.state.ast = NML.Parser.codeToAst('if 5 == 5\n$i = 1\n$j = 2\nend');
      var lastIndex;
      async.times(3, function(i, next) {
        lastIndex = i;
        vm.stepOnce(next);
      }, function(err) {
        expect(err).to.be.an.instanceof(NML.Errors.EndOfScriptError);
        expect(vm.state.ip).to.eql([0]);
        expect(lastIndex).to.equal(2);
        done();
      });
    });

    it('can enter a while loop when the condition provided is true',
      function(done) {
      var vm = new NML.VM();
      vm.state.ast = NML.Parser.codeToAst('while 5 == 5\n$i = 1\n$j = 2\nend');
      vm.stepOnce(function(err) {
        expect(err).to.be.null;
        expect(vm.state.ip).to.eql([0, 0]);
        done();
      });
    });

    it('can loop around in a while loop when condition provided is true',
      function(done) {
      var vm = new NML.VM();
      vm.state.ast = NML.Parser.codeToAst('while 5 == 5\n$i = 1\n$j = 2\nend');
      async.times(10, function(i, next) {
        vm.stepOnce(function(err) {
          expect(err).to.be.null; // err should always be null as we'll never exit the loop
          next();
        });
      }, function(err) {
        expect(err).to.be.null;
        expect(vm.state.ip.length).to.be.above(1);
        done();
      });
    });

    it('can exit from a while loop when the condition turns false',
      function(done) {
      var vm = new NML.VM();
      vm.state.localVars.myVar = 5;
      vm.state.ast = NML.Parser.codeToAst('while $myVar == 5\n$myVar = 4\nend');
      async.times(10, function(i, next) {
        vm.stepOnce(next);
      }, function(err) {
        expect(err).to.be.an.instanceof(NML.Errors.EndOfScriptError);
        expect(vm.state.ip).to.eql([0]);
        done();
      });
    });

    it('can correctly process a nested loop structure',
      function(done) {
      var vm = new NML.VM();
      vm.state.localVars.i = 0;
      vm.state.localVars.j = 0;
      vm.state.localVars.out = 0;
      vm.state.ast = NML.Parser.codeToAst('while $i < 10\n$j = 0\nwhile $j < 5\n$j += 1\n$out += 1\nend\n$i += 1\nend');

      times(LOOP_MAX, vm.stepOnce.bind(vm), function(err) {
        expect(err).to.be.an.instanceof(NML.Errors.EndOfScriptError);
        expect(vm.state.ip).to.eql([0]);
        expect(vm.state.localVars.i).to.equal(10);
        expect(vm.state.localVars.j).to.equal(5);
        expect(vm.state.localVars.out).to.equal(50);
        done();
      });
    });

    it('can delegate execution to a subvm if set', function(done) {
      var hostVm = new NML.VM();
      var subVm = new NML.VM();
      hostVm.state.localVars.i = 0;
      hostVm.state.ast = NML.Parser.codeToAst('while 1 == 1\n$i += 1\nend');
      subVm.state.localVars.j = 0;
      subVm.state.ast = NML.Parser.codeToAst('while 1 == 1\n$j += 1\nend');
      hostVm.subVm = subVm; // Set the sub VM

      times(100, hostVm.stepOnce.bind(hostVm), function(err) {
        expect(err).to.be.null;
        expect(hostVm.state.localVars.i).to.equal(0);
        expect(subVm.state.localVars.j).to.be.above(25);
        done();
      });
    });

    describe('verbcalls', function() {
      var db;
      var mobj;
      var app;

      // A full database (no mocking) is needed for this section of tests as subvms will be operating on the
      // db object, which is too much effort to mock.
      beforeEach(function(done) {
        this.timeout(5000); // Set timeout to 5 seconds, as Travis may take a while
                            // to get mongo set up.

        async.series([
          function(cb) {
            MongoClient.connect('mongodb://127.0.0.1:27017/nickmoo-test', function(err, _db) {
              if (err) throw err;
              db = _db;
              app = {
                rootObj: new MObject(),
                collections: {objects: db.collection('objects')},
                mobj: function (id) {
                  switch (typeof(id)) {
                    case 'string':
                      return new MObject(this, new ObjectId(id));
                    case 'object':
                      if (id instanceof ObjectId) return new MObject(this, id);
                    // Otherwise, fall through to default
                    default:
                      return new MObject(this); // Just return a new mobject
                  }
                }
              };
              cb();
            });
          },
          function(cb) {db.collection('objects').deleteMany({}, cb);}, // Remove everything in the objects collection
          function(cb) {
            db.collection('objects').insertOne({
              _verbs: {
                verb1: {type: 'verb', src: '%propA = 1'},
                verb2: {type: 'verb', src: '%propB = 2'}
              },
              _children: {type: 'array', ctx: []},
              _created: 12345,
              _inherit: null,
              ayy: 'lmao'
            }, function(err, res) {
              if(err) return done(err);
              // Find the id and create a new MObject with it
              mobj = new MObject(app, res.insertedId);
              cb();
            }); // Insert some dummy data
          },
          function() {
            done();
          }
        ], done);
      });

      afterEach(function(done) {
        db.close(false, done);
      });

      it('can execute a verb without arguments', function(done) {
        var vm = new NML.VM(app, mobj, NML.Parser.codeToAst('verb1()'));

        async.series([
          function(cb) {
            vm.stepOnce(function(err) { //cb1
              // On the first step ...
              expect(err).to.be.null; // Expect there to be no error
              expect(vm.subVm).to.be.an.instanceof(NML.VM); // Expect a subvm to exist
              expect(vm.subVm.state.ast).to.eql(NML.Parser.codeToAst('%propA = 1')); // Expect the subvm's AST to be loaded with the source of the verb we're attempting to call
              cb();
            });
          },
          function(cb) {
            vm.stepOnce(function(err) { //cb2
              // On the second step ...
              expect(err).to.be.an.instanceof(NML.Errors.EndOfScriptError);
              expect(vm.subVm).to.be.null; // The subvm should've executed it's statement and it should no-longer exist
              // Check if the property has been set correctly
              mobj.getProp('propA', function(err, value) {
                expect(err).to.be.null;
                expect(value).to.equal(1); // Expect the value to equal 1.
                cb();
              });
            });
          }
        ], done);
      });
    });
  });

  describe('#step', function() {
    it('can loop the correct amount of times', function(done) {
      var vm = new NML.VM();
      vm.state.localVars.i = 0;
      vm.state.ast = NML.Parser.codeToAst('$i += 1\n$i += 1\n$i += 1\n$i += 1\n$i += 1\n$i += 1\n$i += 1\n$i += 1\n$i += 1\n$i += 1\n$i += 1\n');
      vm.step(10, function(err) {
        expect(err).to.be.null;
        expect(vm.state.localVars.i).to.equal(10);
        done();
      });
    });
  });
});
