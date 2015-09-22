module.exports = {
  OPERATORS: { '+': function(left, right) { return left + right; },
               '-':   function(left, right) { return left - right; },
               '/':   function(left, right) { return left / right; },
               '*':   function(left, right) { return left * right; },
              '==':  function(left, right) { return left === right; },
              '!=':  function(left, right) { return left !== right; },
              '>=':  function(left, right) { return left >= right; },
              '<=':  function(left, right) { return left <= right; },
               '>':   function(left, right) { return left > right; },
               '<':   function(left, right) { return left < right; },
              '&&':  function(left, right) { return left && right; },
              '||':  function(left, right) { return left || right; },
             'and': function(left, right) { return left && right; },
              'or':  function(left, right) { return left || right; }
            },
  RESERVED_WORDS: ['='],
  PREPOSITIONS: [
    'with', 'using', 'at', 'to', 'in front of', 'in', 'inside', 'into', 'on top of',
    'on', 'onto', 'upon', 'out of', 'from inside', 'from', 'over', 'through', 'under',
    'underneath', 'beneath', 'behind', 'beside', 'for', 'about', 'is', 'as', 'off',
    'off of'
  ],
  TYPE_COMPATIBILITY: {
    '+': {'number': ['string', 'number'], 'string': ['string'], 'array': ['string'], 'null': ['string']},
    '-': {'number': ['number'], 'string': [], 'array': [], 'null': []},
    '*': {'number': ['number'], 'string': [], 'array': [], 'null': []},
    '/': {'number': ['number'], 'string': [], 'array': [], 'null': []}
  },
  INDEX_SPECIFIABLE: ['array', 'var', 'prop'],
  ASSIGNABLE_TYPES: ['var', 'prop'],
  ASSIGNMENT_OPERATORS: ['=', '+=', '-=', '/=', '*=']
};

// Setup reserved words
module.exports.RESERVED_WORDS = module.exports.RESERVED_WORDS.concat(Object.keys(module.exports.OPERATORS));
