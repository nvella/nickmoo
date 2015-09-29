// NML parser
// Turns NML code into an AST, for the vm to run

var ObjectId = require('mongodb').ObjectId;

var OPERATORS            = require('./constants').OPERATORS;
var PREPOSITIONS         = require('./constants').PREPOSITIONS
var INDEX_SPECIFIABLE    = require('./constants').INDEX_SPECIFIABLE;
var ASSIGNABLE_TYPES     = require('./constants').ASSIGNABLE_TYPES;
var ASSIGNMENT_OPERATORS = require('./constants').ASSIGNMENT_OPERATORS;
var RESERVED_WORDS       = require('./constants').RESERVED_WORDS;

var Parser = {};

// Breaks a line up into it's simple components
Parser.parseLine = function(line, lineNo) {
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
      if(buffer === 'true' || buffer === 'false') { // Parse bools
        ctxStack.slice(-1)[0].ctx.push(buffer === 'true');
      } else if(buffer === 'null') {
        ctxStack.slice(-1)[0].ctx.push({type: 'null', value: null});
      } else if(!isNaN(parseInt(buffer))) {
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
           (line[i] === ']' && line[i - 1] !== '\\') || // If a close-array is encounted and it's not escaped, stop the fluid string
           (line[i] === '(' && line[i - 1] !== '\\') || // If there is an open parens and it wasn't escaped, it's probably method arguments
           (line[i] === ')' && line[i - 1] !== '\\')    // If there is a closeparens and it wasn't escaped, terminate and ignore it.
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
           (line[i] === ']' && line[i - 1] !== '\\') ||
           (line[i] === ')' && line[i - 1] !== '\\')
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
        if( line[i] == ' ' ||
           (line[i] === ']' && line[i - 1] !== '\\') ||
           (line[i] === ')' && line[i - 1] !== '\\')
          ) {
          i--; // Rewind so the specifier can be closed, if it exists (that check is done down below)
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
            state = 'objectid';
            break;
          case '[': // Open array/list
            // We don't change state as we are still interpreting items
            // However, we push to a 'context' stack, so new items go in our
            // array and not the general components array.
            ctxStack.push({type: 'array', ctx: []}); // Push a new array onto the context stack
            break;
          case '(': // Open component grouping
            ctxStack.push({type: 'group', ctx: []});
            break;
          case ')': // Close component grouping
            // Merge the top context down into the context below it
            ctxStack.slice(-2)[0].ctx.push(ctxStack.slice(-1)[0]);
            // Pop off the array from the context stack
            ctxStack.pop();
            break;
          case ',': // The same deal with commas, we mainly use spaces for separating parameters and elements
            break;
          case ']': // Close array/list
            if(INDEX_SPECIFIABLE.indexOf(ctxStack.slice(-1)[0].type) < 0) throw new Error('line ' + lineNo + ': last opened context in line was not an array or array index specifier');
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
          case '\\':
            state = 'fluid';
            // \ is a prefix for the fluid state
            // so \$var will give a fluidstring of $var
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

// Finds a prepoistion in a parsed line
Parser.prepositionsFromParsedLine = function(line) {
  var prepositions = [];
  for(var prepos of PREPOSITIONS) {
    prepos = prepos.split(' '); // Split the prepositions up on the spaces
    var found = false;
    for(var iLine = 0; iLine < line.length; iLine++) {
      found = false;
      for(var iPrepos = 0; iPrepos < prepos.length; iPrepos++) {
        if(line[iLine + iPrepos] !== prepos[iPrepos]) { found = false; break; }
        found = true;
      }
      if(found) { found = iLine; break; }
    }
    if(found !== false) {
      prepositions.push({
        prepos: prepos.join(' '),
        size: prepos.length,
        found: found
      });
    }
  }

  // Run through the prepositions array and delete duplicates
  for(var prepos of prepositions) {
    for(var p of prepositions) {
      if(p.found === prepos.found) {
        // Delete the smaller one
        if(p.size > prepos.size) prepositions.splice(prepositions.indexOf(prepos), 1);
        if(p.size < prepos.size) prepositions.splice(prepositions.indexOf(p), 1);
      }
    }
  }

  return prepositions;
}

Parser.verbcallFromParsedLine = function(line) {
  // Searching for the preposition is a fair bit of effort, as they are split up across multiple words
  var preposList = Parser.prepositionsFromParsedLine(line);
  var origLine = line.slice();
  // Delete any prepositions in the line at index 1
  if(preposList.length > 0 && preposList[0].found === 1) {
    var preposRemove = preposList[0];
    line.splice(1, preposRemove.size);
    // Offset all the prepositions in the list as the indexes have changed
    for(var prepos of preposList) {
      prepos.found -= preposRemove.size;
    }
    preposList.splice(0, 1);
  }

  // Find the verb, direct object, prepos and indirect object, if they exist
  var verb = line[0];
  var directObj = null;
  var prepos = null;
  var indirectObj = null;
  if(line.length > 1) { // There is a direct object
    // Is there a preposition
    if(preposList.length > 0) {
      directObj = line.slice(1, preposList[0].found);
      prepos = preposList[0].prepos;
      indirectObj = line.slice(preposList[0].found + preposList[0].size, line.length);
    } else {
      directObj = line.slice().splice(1, line.length);
    }
  }

  return {
    type: 'verbcall',
    verb: verb,
    directObj: directObj,
    prepos: prepos,
    indirectObj: indirectObj,
    params: origLine.slice(1, origLine.length) // Include the original parameter list, as some commands may need it
  }
}

Parser.parseGroup = function(groupConcat, level, lineNo) {
  if(level === undefined) level = 0;
  var err = function(str) {
    throw new Error('line ' + lineNo + ': ' + str);
  };
  if(groupConcat.length < 1) return groupConcat; // If the group is empty, just return it
  var commentExists = groupConcat.slice(-1)[0].type === 'comment';

  function processSubgroup(parsed) {
    // Moved this up here
    // Find all groups
    //  If a string precedes any of these groups, it's a verbcall
    //console.log()
    for(var com of parsed) {
      if(com.type === 'group' || com.type === 'array') {
        var i = parsed.indexOf(com);
        if(com.type === 'group' && typeof(parsed[i - 1]) === 'string' && RESERVED_WORDS.indexOf(parsed[i - 1]) < 0) {
          parsed[i - 1] = Parser.verbcallFromParsedLine([parsed[i - 1]].concat(Parser.parseGroup(com.ctx, level + 1, lineNo)));
          parsed.splice(i, 1);
        } else {
          parsed[i] = Parser.parseGroup(com.ctx, level + 1, lineNo);
        }
      }
    }

    // If we are in the first level, there may be a vague verbcall (no parens)
    // Check if so
    if(typeof(parsed[0]) === 'string' && level === 0) {
      return [Parser.verbcallFromParsedLine(parsed)];
      // Seeing as a verbcall like this would take up the whole line/group,
      // replace the group with an array with just this verbcall
      //obj.result = [verbcall];
      //continue;
    }

    if(ASSIGNMENT_OPERATORS.indexOf(parsed[1]) >= 0) {
      // An assignment has been attempted
      if(parsed[2] === undefined || parsed[2].type === 'comment') err('an assignment must have two sides');
      if(ASSIGNABLE_TYPES.indexOf(parsed[0].type) < 0) err('type on left of assignment cannot be set');
      // All good here, add it to the current block
      var stmt = {
        type: 'assign',
        op: parsed[1][0],
        src: Parser.parseGroup(parsed.slice(2, parsed.length - (commentExists ? 1 : 0)), level + 1, lineNo),
        dst: parsed[0]
      };
      // Replace this group with the statement in an array, as it now encompasses
      // the original group
      return [stmt];
    }

    return parsed;
  }

  return processSubgroup(groupConcat);
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
    var line = Parser.parseLine(lines[lineNo].trim(), parseInt(lineNo) + 1);
    if(line.length < 1) continue; // Skip line, it's empty
    var commentExists = line.slice(-1)[0].type === 'comment';
    var err = function(str) {
      throw new Error('line ' + (parseInt(lineNo) + 1) + ': ' + str);
    };
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
        var statement = {
          type: initialKeyword,
          expr: Parser.parseGroup(line.slice(1, line.length - (commentExists ? 1 : 0)), 0, parseInt(lineNo) + 1),
          block: []
        };
        if(statement.expr.length < 1) err(initialKeyword + ' usage: ' + initialKeyword + ' <expr>');
        blockStack.slice(-1)[0].push(statement);
        blockStack.push(statement.block);
        continue;
    }

    // Alright, it's none of these things, we can parse the group
    blockStack.slice(-1)[0].push(Parser.parseGroup(line, 0, parseInt(lineNo) + 1)[0]);
  }

  if(blockStack.length > 1) throw new Error((blockStack.length - 1) + ' block(s) are still open.');

  return ast;
}

module.exports = Parser;
