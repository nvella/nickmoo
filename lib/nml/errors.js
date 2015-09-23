function EndOfScriptError(message) {
  this.name = 'EndOfScriptError';
  this.message = message || '';
  this.stack = (new Error()).stack;
}
EndOfScriptError.prototype = Object.create(EndOfScriptError.prototype);
EndOfScriptError.prototype.constructor = EndOfScriptError;

module.exports = {
  EndOfScriptError: EndOfScriptError
};
