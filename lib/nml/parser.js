// NML parser
// Turns NML code into an AST, for the vm to run

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
var INDEX_SPECIFIABLE = ['array', 'var', 'prop'];
var ASSIGNABLE_TYPES = ['var', 'prop'];

var Parser = {};

// Breaks a line up into it's simple components
Parser.parseLine = function(line) {
  // First, create the components array
  var components = [];
  var ctxStack = [{type: 'root', ctx: components}];

  // We'll start by creating string literals
  // String literals are stated by single quotes, nothing else
  var state = null;
  var buffer = '';

  // Termination functions
  var term = {
    fluid: function() {
      if(!isNaN(parseInt(buffer))) {
        ctxStack.slice(-1)[0].ctx.push(parseInt(buffer));
      } else {
        ctxStack.slice(-1)[0].ctx.push(buffer);
      }
      state = null; // Go back to the default state;
    },
    stringlit: function() {
      ctxStack.slice(-1)[0].ctx.push(buffer);
      state = null;
    },
    objectid: function() {
      ctxStack.slice(-1)[0].ctx.push(new ObjectId(buffer));
      state = null;
    },
    objectidalias: function() {
      ctxStack.slice(-1)[0].ctx.push({type: 'objectIdAlias', value: buffer});
      state = null;
    },
    var: function() {
      ctxStack.slice(-1)[0].ctx.push({type: 'var', name: buffer});
      state = null;
    },
    prop: function() {
      ctxStack.slice(-1)[0].ctx.push({type: 'prop', name: buffer});
      state = null;
    },
    comment: function() {
      ctxStack.slice(-1)[0].ctx.push({type: 'comment', text: buffer});
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
        if( line[i] === ' ' || // Spaces will terminate the fluid string
           (line[i] === ']' && line[i - 1] !== '\\') // If a close-array is encounted and it's not escaped, stop the fluid string
          ) {
          i--; // Rewind a character so the space can be interpreted below
          term[state]();
        } else {
          buffer += line[i];
        }
        break;
      case 'var':
      case 'prop':
        if( line[i] == ' ' ||
           (line[i] === ']' && line[i - 1] !== '\\')
          ) {
          i--; // Rewind so the specifier can be closed, if it exists (that check is done down below)
          term[state]();
        } else if(line[i] == '[') {
          // Go onto the context stack from here, as we need to wait for the
          // close bracket. This will also allow us to use variables inside the
          // index specifier
          ctxStack.push({type: state, name: buffer, ctx: []});
          state = null; // Set state to null
        } else {
          buffer += line[i];
        }
        break;
      case 'objectid':
      case 'objectidalias':
        if(line[i] == ' ') {
          term[state]();
        } else {
          buffer += line[i];
        }
        break;
      case 'comment':
        // Comments cannot be broken out of
        buffer += line[i];
        break;
      default:
        buffer = '';
        // Find the next state
        switch(line[i]) {
          case '\'': // String literal
            state = 'stringlit';
            break;
          case '$': // Local var
            state = 'var';
            break;
          case '%': // Object property
            state = 'prop';
            break;
          case '#': // ObjectId or Object Id Alias
            if(line[i + 1] == '#') { // ## for ObjectId alises - eg. ##ROOT
              state = 'objectidalias';
              i++; // Skip the extra hash
            } else {
              state = 'objectid';
            }
            break;
          case '[': // Open array/list
            // We don't change state as we are still interpreting items
            // However, we push to a 'context' stack, so new items go in our
            // array and not the general components array.
            ctxStack.push({type: 'array', ctx: []}); // Push a new array onto the context stack
            break;
          case ']': // Close array/list
            if(INDEX_SPECIFIABLE.indexOf(ctxStack.slice(-1)[0].type) < 0) throw 'last opened context in line was not an array or array index specifier';
            // Merge the top context down into the context below it
            ctxStack.slice(-2)[0].ctx.push(ctxStack.slice(-1)[0]);
            // Pop off the array from the context stack
            ctxStack.pop();
            break;
          case ';': // Comment
            state = 'comment';
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
Parser.conditionsFromParsedLine = function(line) {
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
Parser.codeToAst = function(code) {
  var ast = [];
  var lines = code.split("\n");
  var blockStack = [ast]; // Code is added to the last element on this
                          // array/stack.

  // Iterate over each line of code
  for(var lineNo in lines) {
    var line = Parser.parseLine(lines[lineNo].trim());
    var err = function(str) {
      throw 'line ' + parseInt(lineNo + 1) + ': ' + str;
    }
    // Step 1- Is this a function declaration, if statement, or any structure
    //         that begins with a keyword. 'Is it a keyword?'
    //    How- Split it on spaces, look at the first word

    var initialKeyword = line[0];
    switch(initialKeyword) {
      case 'end':
        if(blockStack.length < 2) err('no blocks to end (no blocks to end on stack)');
        blockStack.pop();
        continue;
      case 'while':
      case 'if':
        // Form if/while statement
        // Use same code for both, from ast point of view they're the same
        var conditions = Parser.conditionsFromParsedLine(line.slice(1, line.length));
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

    // Step 2- Is this a declaration/assignment? Check for equals in line[1];
    if(line[1] === '=') {
      if(line[2] === undefined || line[2].type === 'comment') err('an assignment must have two sides');
      if(ASSIGNABLE_TYPES.indexOf(line[0].type) < 0) err('type on left of assignment cannot be set');
      // All good here, add it to the current block
      var stmt = {
        type: 'set',
        src: line[2],
        dst: line[0]
      };
      // if line[2] is a string, join the rest of the line together for the src
      // TODO This implementation is bad, makes no sense
      //      Comments are included, wtf
      //if(typeof(stmt.src) === 'string') stmt.src = line.slice(2, line.length).join(' ');
      // Push it onto the current block
      blockStack.slice(-1)[0].push(stmt);
      continue;
    }

    // Step 3- This is a statement of some kind. Figure out what it is and put it
    //         in the current block.
    //    How- Find a preposition if it exists

  }

  if(blockStack.length > 1) throw (blockStack.length - 1) + ' block(s) are still open.';

  return ast;
}

module.exports = Parser;
