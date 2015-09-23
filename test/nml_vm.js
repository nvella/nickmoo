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
        callback(null, ['apple', 'banana']);
      }};
      var vm = new NML.VM(undefined, mobj);

      vm.resolveValue({type: 'prop', name: 'myProp', ctx: [1]}, function(err, value) {
        expect(err).to.be.null;
        expect(value).to.equal('banana');
        done();
      });
    });
  });
});
