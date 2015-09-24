var expect = require('chai').expect;
var NML = require('../lib/nml');

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
        'if true\nsay test\nif false\nsay lol\nend\nend');
      expect(NML.VM.findIns([2, 1, 0], ast).type).to.equal('verbcall');
      expect(NML.VM.findIns([2, 1, 0], ast).verb).to.equal('say');
      expect(NML.VM.findIns([2, 1, 0], ast).params).to.eql(['lol']);
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
  });

  describe('#stepOnce', function() {
    it('can assign a local var', function(done) {
      var vm = new NML.VM();
      vm.state.ast = NML.Parser.codeToAst('$myVar = 4');
      vm.stepOnce(function(err) {
        expect(vm.state.localVars.myVar).to.equal(4);
        done();
      });
    });

    it('throws an error at the end of the script', function(done) {
      var vm = new NML.VM();
      vm.state.ast = NML.Parser.codeToAst('$myVar = 4');
      vm.stepOnce(function(err) {
        expect(err).to.be.an.instanceof(NML.Errors.EndOfScriptError);
        done();
      });
    });
  });
});
