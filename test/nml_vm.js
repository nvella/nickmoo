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
});
