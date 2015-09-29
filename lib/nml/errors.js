function EndOfScriptError(message) {
  this.name = 'EndOfScriptError';
  this.message = message || '';
  this.stack = (new Error()).stack;
}
EndOfScriptError.prototype = Object.create(Error.prototype);
EndOfScriptError.prototype.constructor = EndOfScriptError;

function NMLSyntaxError(message) {
  this.name = 'NMLSyntaxError';
  this.message = message || '';
  this.stack = (new Error()).stack;
}
NMLSyntaxError.prototype = Object.create(Error.prototype);
NMLSyntaxError.prototype.constructor = NMLSyntaxError;

module.exports = {
  EndOfScriptError: EndOfScriptError,
  NMLSyntaxError: NMLSyntaxError
};
