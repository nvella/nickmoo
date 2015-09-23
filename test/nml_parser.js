var expect = require('chai').expect;
var Parser = require('../lib/nml/parser');

describe('NML.Parser', function() {
  describe('parseLine', function() {
    it('handles bareword strings', function() {
      expect(Parser.parseLine('the quick brown fox')).to.eql(['the', 'quick',
        'brown', 'fox']);
    });

    it('handles simple numbers', function() {
      expect(Parser.parseLine('4')).to.eql([4]);
    });

    it('handles simple numbers wedged between two bareword strings', function() {
      expect(Parser.parseLine('the quick 4 brown fox')).to.eql(['the', 'quick',
        4, 'brown', 'fox']);
    });

    it('handles string literals correctly (as single components)', function() {
      expect(Parser.parseLine("'the quick 4 brown fox'")).to.eql([
        'the quick 4 brown fox']);
    });
  });
});
