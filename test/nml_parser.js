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

  describe('prepositionsFromParsedLine', function() {
    it('is able to find simple prepositions', function() {
      var line = Parser.parseLine('put apple in box');
      var prepositions = Parser.prepositionsFromParsedLine(line);
      expect(prepositions).to.eql([
        {
          prepos: 'in',
          size: 1, // one word
          found: 2 // third component in line
        }
      ]);
    });

    it('is able to find multiple simple prepositions', function() {
      var line = Parser.parseLine('point to apple in box');
      var prepositions = Parser.prepositionsFromParsedLine(line);
      expect(prepositions).to.eql([
        {
          prepos: 'to',
          size: 1, // one word
          found: 1 // second component in line
        },
        {
          prepos: 'in',
          size: 1,
          found: 3
        }
      ]);
    });

    it('is able to find multi-word prepositions', function() {
      var line = Parser.parseLine('put apple in front of box');
      var prepositions = Parser.prepositionsFromParsedLine(line);
      expect(prepositions).to.eql([
        {
          prepos: 'in front of',
          size: 3,
          found: 2
        }
      ]);
    });

    it('is able to find multiple multi-word prepositions', function() {
      var line = Parser.parseLine('eat on top of table in front of box');
      var prepositions = Parser.prepositionsFromParsedLine(line);
      expect(prepositions).to.eql([
        {
          prepos: 'in front of',
          size: 3,
          found: 5
        },
        {
          prepos: 'on top of',
          size: 3,
          found: 1
        }
      ]);
    });

    it('disregards smaller available prepositions when larger ones are available', function() {
      var line = Parser.parseLine('eat apple in front of box');
      var prepositions = Parser.prepositionsFromParsedLine(line);
      expect(prepositions).to.eql([
        {
          prepos: 'in front of',
          size: 3, // one word
          found: 2 // second component in line
        }
      ]);
    });
  });

  describe('verbcallFromParsedLine', function() {
    it('supports single word (verb only) verbcalls', function() {
      var line = Parser.parseLine('north');
      var verbcall = Parser.verbcallFromParsedLine(line);
      expect(verbcall).to.eql({
        type: 'verbcall',
        verb: 'north',
        directObj: null,
        prepos: null,
        indirectObj: null,
        params: []
      });
    });

    it('supports verbcalls with direct objects', function() {
      var line = Parser.parseLine('eat apple');
      var verbcall = Parser.verbcallFromParsedLine(line);
      expect(verbcall).to.eql({
        type: 'verbcall',
        verb: 'eat',
        directObj: ['apple'],
        prepos: null,
        indirectObj: null,
        params: ['apple']
      });
    });

    it('supports verbcalls with direct and indirect objects', function() {
      var line = Parser.parseLine('put apple in box');
      var verbcall = Parser.verbcallFromParsedLine(line);
      expect(verbcall).to.eql({
        type: 'verbcall',
        verb: 'put',
        directObj: ['apple'],
        prepos: 'in',
        indirectObj: ['box'],
        params: ['apple', 'in', 'box']
      });
    });

    it('disregards prepositions before the direct object', function() {
      var line = Parser.parseLine('write using pencil on paper');
      var verbcall = Parser.verbcallFromParsedLine(line);
      expect(verbcall).to.eql({
        type: 'verbcall',
        verb: 'write',
        directObj: ['pencil'],
        prepos: 'on',
        indirectObj: ['paper'],
        params: ['using', 'pencil', 'on', 'paper']
      });
    });
  });
});
