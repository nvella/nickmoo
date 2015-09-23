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

  describe('parseGroup', function() {
    it('creates verbcalls when the first component is a string and level is 0',
    function() {
      var line = Parser.parseLine('say Hello world');
      expect(Parser.parseGroup(line, 0, 0)).to.eql([
        {
          type: 'verbcall',
          verb: 'say',
          directObj: ['Hello', 'world'],
          prepos: null,
          indirectObj: null,
          params: ['Hello', 'world']
        }
      ]);
    });

    it('doesn\'t create a verbcall when first component is string and level > 0',
      function() {
      var line = Parser.parseLine('say Hello world');
      expect(Parser.parseGroup(line, 1, 0)).to.eql([
        'say',
        'Hello',
        'world'
      ]);
    });

    it('always creates a verbcall when a word is followed by a group (parens)',
      function() {
      for(var i = 0; i < 3; i++) {
        var line = Parser.parseLine('say(Hello world)');
        expect(Parser.parseGroup(line, i, 0)).to.eql([
          {
            type: 'verbcall',
            verb: 'say',
            directObj: ['Hello', 'world'],
            prepos: null,
            indirectObj: null,
            params: ['Hello', 'world']
          }
        ]);
      }
    });

    it('is able to create a verbcall with a verbcall as a parm', function() {
      var line = Parser.parseLine('firstVerb(secondVerb())');
      expect(Parser.parseGroup(line, 0, 0)).to.eql([
        {
          type: 'verbcall',
          verb: 'firstVerb',
          directObj: [{
            type: 'verbcall',
            verb: 'secondVerb',
            directObj: null,
            prepos: null,
            indirectObj: null,
            params: []
          }],
          prepos: null,
          indirectObj: null,
          params: [{
            type: 'verbcall',
            verb: 'secondVerb',
            directObj: null,
            prepos: null,
            indirectObj: null,
            params: []
          }]
        }
      ]);
    });

    it('is able to create a bareword verbcall with a verbcall as a parm',
      function() {
      var line = Parser.parseLine('firstVerb secondVerb()');
      expect(Parser.parseGroup(line, 0, 0)).to.eql([
        {
          type: 'verbcall',
          verb: 'firstVerb',
          directObj: [{
            type: 'verbcall',
            verb: 'secondVerb',
            directObj: null,
            prepos: null,
            indirectObj: null,
            params: []
          }],
          prepos: null,
          indirectObj: null,
          params: [{
            type: 'verbcall',
            verb: 'secondVerb',
            directObj: null,
            prepos: null,
            indirectObj: null,
            params: []
          }]
        }
      ]);
    });

    it('it won\'t create a bareword verbcall with a verbcall as a parm when ' +
      'lvl>0', function() {
      var line = Parser.parseLine('firstVerb secondVerb()');
      expect(Parser.parseGroup(line, 1, 0)).to.eql([
        'firstVerb',
        {
          type: 'verbcall',
          verb: 'secondVerb',
          directObj: null,
          prepos: null,
          indirectObj: null,
          params: []
        }
      ]);
    });

    it('creates simple assignments', function() {
      var line = Parser.parseLine('$myVar = 4');
      expect(Parser.parseGroup(line, 0, 0)).to.eql([
        {
          type: 'assign',
          op: '=',
          dst: {
            type: 'var',
            name: 'myVar'
          },
          src: [4]
        }
      ]);
    });

    it('creates assignments based on the return val of a verbcall', function() {
      var line = Parser.parseLine('$myVar = getValue()');
      expect(Parser.parseGroup(line, 0, 0)).to.eql([
        {
          type: 'assign',
          op: '=',
          dst: {
            type: 'var',
            name: 'myVar'
          },
          src: [{
            type: 'verbcall',
            verb: 'getValue',
            directObj: null,
            prepos: null,
            indirectObj: null,
            params: []
          }]
        }
      ]);
    });

    it('supports grouping in expressions', function() {
      var line = Parser.parseLine('5 + 4 + (3 * 2)');
      expect(Parser.parseGroup(line, 0, 0)).to.eql([
        5, '+', 4, '+',
        [3, '*', 2]
      ]);
    });

    it('supports verbcalls in groups', function() {
      var line = Parser.parseLine('5 + 4 + (3 * 2 + test())');
      expect(Parser.parseGroup(line, 0, 0)).to.eql([
        5, '+', 4, '+',
        [ 3, '*', 2, '+',
          {
            type: 'verbcall',
            verb: 'test',
            directObj: null,
            prepos: null,
            indirectObj: null,
            params: []
          }
        ]
      ]);
    });

    it('is able to used grouped expressions in an assingment', function() {
      var line = Parser.parseLine('$myVar = 5 + 4 + (3 * 2 + test())');
      expect(Parser.parseGroup(line, 0, 0)).to.eql([
        {
          type: 'assign',
          op: '=',
          dst: {
            type: 'var',
            name: 'myVar'
          },
          src: [ 5, '+', 4, '+',
                 [ 3, '*', 2, '+',
                  {
                    type: 'verbcall',
                    verb: 'test',
                    directObj: null,
                    prepos: null,
                    indirectObj: null,
                    params: []
                  }
                 ]
               ]
        }
      ]);
    });
  });

  describe('codeToAst', function() {
    it('handles verbcalls', function() {
      expect(Parser.codeToAst('say Hi')).to.eql([
        {
          type: 'verbcall',
          verb: 'say',
          directObj: ['Hi'],
          prepos: null,
          indirectObj: null,
          params: ['Hi']
        }
      ]);
    });

    it('handles verbcalls with prepositions', function() {
      expect(Parser.codeToAst('put apple in box')).to.eql([
        {
          type: 'verbcall',
          verb: 'put',
          directObj: ['apple'],
          prepos: 'in',
          indirectObj: ['box'],
          params: ['apple', 'in', 'box']
        }
      ]);
    });

    it('handles verbcalls with params in parens', function() {
      expect(Parser.codeToAst("say('Hello there' 4)")).to.eql([
        {
          type: 'verbcall',
          verb: 'say',
          directObj: ['Hello there', 4],
          prepos: null,
          indirectObj: null,
          params: ['Hello there', 4]
        }
      ]);
    });

    it('handles if statements', function() {
      expect(Parser.codeToAst('if true\nend')).to.eql([
        {
          type: 'if',
          expr: [true],
          block: []
        }
      ]);
    });

    it('handles while statements', function() {
      expect(Parser.codeToAst('while true\nend')).to.eql([
        {
          type: 'while',
          expr: [true],
          block: []
        }
      ]);
    });

    it('handles blocks', function() {
      expect(Parser.codeToAst('if true\nsay hi\nend\nsay bye')).to.eql([
        {
          type: 'if',
          expr: [true],
          block: [
            {
              type: 'verbcall',
              verb: 'say',
              directObj: ['hi'],
              prepos: null,
              indirectObj: null,
              params: ['hi']
            }
          ]
        },
        {
          type: 'verbcall',
          verb: 'say',
          directObj: ['bye'],
          prepos: null,
          indirectObj: null,
          params: ['bye']
        }
      ]);
    });

    it('handles expressions referencing variables in if/while', function() {
      expect(Parser.codeToAst('if $myVar == 4\nsay hi\nend')).to.eql([
        {
          type: 'if',
          expr: [{type: 'var', name: 'myVar'}, '==', 4],
          block: [
            {
              type: 'verbcall',
              verb: 'say',
              directObj: ['hi'],
              prepos: null,
              indirectObj: null,
              params: ['hi']
            }
          ]
        }
      ]);
    });

    it('handles nested expressions in if/while', function() {
      expect(Parser.codeToAst('if $myVar == ($myOtherVar + 2)\nsay hi\nend')).
        to.eql([
        {
          type: 'if',
          expr: [{type: 'var', name: 'myVar'}, '==', [{type: 'var', name:
            'myOtherVar'}, '+', 2]],
          block: [
            {
              type: 'verbcall',
              verb: 'say',
              directObj: ['hi'],
              prepos: null,
              indirectObj: null,
              params: ['hi']
            }
          ]
        }
      ]);
    });

    it('throws an error if blocks are left open', function() {
      expect(function(){Parser.codeToAst('if $myVar\nsay hi');}).to.throw(Error,
        '1 block(s) are still open.');
    });

    it('throws an error on attempt to end nonexistant block', function() {
      expect(function(){Parser.codeToAst('say hi\nend');}).to.throw(Error,
        'line 2: no blocks to end (no blocks to end on stack)');
    });

    it('throws an error if an if/while is started without an expr', function() {
      expect(function(){Parser.codeToAst('if\nsay hi\nend');}).to.throw(Error,
        'line 1: if usage: if <expr>');
    });

    it('throws an error if an assignment doesn\'t have two sides', function() {
      expect(function(){Parser.codeToAst('$a =\nsay hi');}).to.throw(Error,
        'line 1: an assignment must have two sides');
    });

    it('throws an error if a non-assignable has attempted to be assigned',
      function() {
      expect(function(){Parser.codeToAst('4 = $a\nsay hi');}).to.throw(Error,
        'line 1: type on left of assignment cannot be set');
    });
  });
});
