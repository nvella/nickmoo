var ObjectId = require('mongodb').ObjectId;
var NML = require('./nml');

// MObject = MOO Object
// Representation of a database game object in JS
var MObject = function(app, id) {
  this._app = app;
  this.id = id || new ObjectId();
  this.created = Math.floor(new Date() / 1000);
}

MObject.PROP_NO_READ  = ['_verbs'];
MObject.PROP_NO_WRITE = ['_created'];

// Get a verb's source from the database
MObject.prototype.getVerb = function(verb, callback) {
  this._app.collections.objects.findOne({_id: this.id}, function(err, docs) {
    if(err) return callback(err);
    var src = docs[0]._verbs[verb];
    if(src === undefined) return callback(new Error('verb does not exist'));
    callback(null, src);
  }.bind(this));
}

// Create a VM using the verb name specified
MObject.prototype.vmFromVerb = function(verb, callback) {
  this._app.collections.objects.findOne({_id: this.id}, function(err, docs) {
    if(err) return callback(err);
    var src = docs[0]._verbs[verb];
    if(src === undefined) return callback(new Error('verb does not exist'));

    var ast = NML.Parser.codeToAst(src);
    var vm = new NML.VM(this._app, this, ast);
    callback(null, vm);
  }.bind(this));
}

// Return an object property, return null if it's private (prefixed with _)
MObject.prototype.getProp = function(prop, callback) {
  if(MObject.PROP_NO_READ.indexOf(prop) >= 0) return callback(null, {type: 'null', value: null});
  this._app.collections.objects.findOne({_id: this.id}, function(err, docs) {
    if(err) return callback(err);
    if(docs.length < 1) return callback(new Error('no object with id'));
    if(docs[0][prop] === undefined) return callback(null, {type: 'null', value: null});
    return callback(null, docs[0][prop]);
  }.bind(this));
}

// Set an object property, do nothing if it's private
MObject.prototype.setProp = function(prop, value, callback) {
  if(prop[0] === '_') return callback(null); // This works because all read-only and no-write props are prefixed with an underscore
  var upd = {};
  upd[prop] = value;
  this._app.collections.objects.updateOne({_id: this.id}, upd, {upsert: true}, callback);
}

module.exports = MObject;
