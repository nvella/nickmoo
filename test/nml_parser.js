var expect = require('chai').expect;
var Parser = require('../lib/nml/parser');
var ObjectId = require('mongodb').ObjectId;

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

    it('handles local variables', function() {
      expect(Parser.parseLine('abc $myVar def')).to.eql(['abc', {type: 'var',
        name: 'myVar'}, 'def']);
    });

    it('handles object properties', function() {
      expect(Parser.parseLine('abc %myProp def')).to.eql(['abc', {type: 'prop',
        name: 'myProp'}, 'def']);
    });

    it('handles comments', function() {
      expect(Parser.parseLine('the quick brown ;fox jumped over $lazy %dog (1 2 3 4)')).
        to.eql(['the', 'quick', 'brown', {type: 'comment', text:
        'fox jumped over $lazy %dog (1 2 3 4)'}]);
    });

    it('handles object ids', function() {
      expect(Parser.parseLine('the quick brown #012345678901234567890123')).to.
        eql(['the', 'quick', 'brown', new ObjectId('012345678901234567890123')]);
    });

    it('handles object id aliases', function() {
      expect(Parser.parseLine('the quick ##root')).to.eql(['the', 'quick',
        {type: 'objectIdAlias', value: 'root'}]);
    });

    it('handles arrays', function() {
      expect(Parser.parseLine('hey [1 2 3 4] there')).to.eql(['hey',
        {type: 'array', ctx: [1, 2, 3, 4]}, 'there']);
    });

    it('handles indexes on indexable components', function() {
      expect(Parser.parseLine('hey $myVar[24] there')).to.eql(['hey',
        {type: 'var', name: 'myVar', ctx: [24]}, 'there']);

      expect(Parser.parseLine('hey %myProp[32] there')).to.eql(['hey',
        {type: 'prop', name: 'myProp', ctx: [32]}, 'there']);
    });

    it('groups components in parens', function() {
      expect(Parser.parseLine('this is (a very nice test) 1 2')).to.eql([
        'this',
        'is',
        {type: 'group', ctx: ['a', 'very', 'nice', 'test']},
        1,
        2
      ]);
    });
  });


});
