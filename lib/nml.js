// NML interpreter

var ObjectId = require('mongodb').ObjectId;

var PREPOSITIONS = [
  'with', 'using', 'at', 'to', 'in front of', 'in', 'inside', 'into', 'on top of',
  'on', 'onto', 'upon', 'out of', 'from inside', 'from', 'over', 'through', 'under',
  'underneath', 'beneath', 'behind', 'beside', 'for', 'about', 'is', 'as', 'off',
  'off of'
]
var CONDITIONAL_COMPARATORS = ['>', '=', '<', '!=', 'in'];
var CONDITIONAL_JOINS       = ['and', 'or'];
// in: object is in another
//     object is in list
// eg. 'person in car' is true if person is a child of car
// eg. '1 in [1, 2, 3]' is true

var NML = function(app, owner) {
  this._app  = app;
  this.owner = owner;

  this.ast = [];
  /*[
      {
        type: "humanStatement",
        directObject: {
          type: "objectRef",
          human: "red apple",
          ref: OBJECTID // Go to owner to resolve object name
        },
        verb: "put",
        preposition: "in", // mostly disregarded
        indirectObject: {
          type: "objectRef",
          human: "box",
          ref: OBJECTID
        }
      },
      {
        type: "if",
        left: {
          type: "number",
          value: 4
        },
        right: {
          type: "number",
          value: 2
        },
        condition: ">",
        "true": [
          // More statements here
        ],
        "false": [

        ]
      }
    ]
*/
}

// Breaks a line up into it's simple components
NML.parseLine = function(line) {
  // First, create the components array
  var components = [];

  // We'll start by creating string literals
  // String literals are stated by single quotes, nothing else
  var state = null;
  var buffer = '';

  // Termination functions
  var term = {
    fluid: function() {
      if(!isNaN(parseInt(buffer))) {
        components.push(parseInt(buffer));
      } else {
        components.push(buffer);
      }
      state = null; // Go back to the default state;
    },
    stringlit: function() {
      components.push(buffer);
      state = null;
    },
    objectid: function() {
      components.push(new ObjectId(buffer));
      state = null;
    },
    objectidalias: function() {
      components.push({type: 'objectIdAlias', value: buffer});
      state = null;
    },
    var: function() {
      components.push({type: 'var', name: buffer});
      state = null;
    },
    prop: function() {
      components.push({type: 'prop', name: buffer});
      state = null;
    },
    null: function() {}
  }

  // ssss state machine whoop whoop
  for(var i = 0; i < line.length; i++) {
    switch(state) {
      case 'stringlit':
        if(line[i] === '\'' && line[i - 1] !== '\\') {
          term.stringlit();
        } else {
          buffer += line[i];
        }
        break;
      case 'fluid':
      case 'var':
      case 'prop':
      case 'objectid':
      case 'objectidalias':
        if(line[i] == ' ') {
          term[state]();
        } else {
          buffer += line[i];
        }
        break;
      default:
        buffer = '';
        // Find the next state
        switch(line[i]) {
          case '\'':
            state = 'stringlit';
            break;
          case '$':
            state = 'var';
            break;
          case '%':
            state = 'prop';
            break;
          case '#':
            if(line[i + 1] == '#') { // ## for ObjectId alises - eg. ##ROOT
              state = 'objectidalias';
              i++; // Skip the extra hash
            } else {
              state = 'objectid';
            }
            break;
          case ' ':
            // Don't really do anything on spaces
            break;
          default:
            state = 'fluid';
            i--; // Go back a character so the fluid state can interpret it
        }
    }
  }

  term[state](); // Terminate the current state

  return components;
}

// Gets conditions out of parsed line. For if, while, etc.
NML.conditionsFromParsedLine = function(line) {
  var conditions = [];
  for(var i = 0; i < line.length; i += 4) {
    if(line[i]   === undefined) throw 'conditions usage: <statement> <thing1> <comparator> <thing2> [join]; <thing1> missing';
    if(line[i+1] === undefined) throw 'conditions usage: <statement> <thing1> <comparator> <thing2> [join]; <comparator> missing';
    if(line[i+2] === undefined) throw 'conditions usage: <statement> <thing1> <comparator> <thing2> [join]; <thing2> missing';
    if(CONDITIONAL_COMPARATORS.indexOf(line[i+1]) < 0) throw 'conditions usage: <statement> <thing1> <comparator> <thing2>; <comparator> not valid';
    if(line[i+3] !== undefined && CONDITIONAL_JOINS.indexOf(line[i+3]) < 0) throw 'conditions usage: <statement> <thing1> <comparator> <thing2>; [join] not valid';

    // IF statement valid, lets go
    var condition = {
      left: line[i],
      comparator: line[i + 1],
      right: line[i + 2],
      join: line[i + 3] || null
    };
    conditions.push(condition);
  }
  if(conditions.length < 1) throw 'conditions usage: <statement> <thing1> <comparator> <thing2>';

  return conditions;
}

// Loads a block of written NML code and translates it to AST, returns it
// ready for load into a vm or storage
NML.codeToAst = function(code) {
  var ast = [];
  var lines = code.split("\n");
  var blockStack = [ast]; // Code is added to the last element on this
                          // array/stack.

  // Iterate over each line of code
  for(var lineNo in lines) {
    var line = NML.parseLine(lines[lineNo]);
    // Step 1- Is this a function declaration, if statement, or any structure
    //         that begins with a keyword. 'Is it a keyword?'
    //    How- Split it on spaces, look at the first word

    var initialKeyword = line[0];
    switch(initialKeyword) {
      case 'end':
        if(blockStack.length < 2) throw 'no blocks to end (no blocks to end on stack)';
        blockStack.pop();
        continue;
      case 'while':
      case 'if':
        // Form if/while statement
        // Use same code for both, from ast point of view they're the same
        var conditions = NML.conditionsFromParsedLine(line.slice(1, line.length));
        // Alright, all verified, push the statement onto the AST and the new block onto the stack
        var newBlock = [];
        var statement = {
          type: initialKeyword,
          conditions: conditions,
          block: newBlock
        };
        blockStack.slice(-1)[0].push(statement);
        blockStack.push(newBlock);
        continue;
    }
  }

  return ast;
}

module.exports = NML;
