var ObjectId = require('mongodb').ObjectId;

// MObject = MOO Object
// Representation of a database game object in JS
var MObject = function(app, id) {
  this._app = app;
  this.id = id || new ObjectId();
  this.created = Math.floor(new Date() / 1000);
}

MObject.PROP_NO_READ  = ['_verbs'];
MObject.PROP_NO_WRITE = ['_created'];

// Load metadata from the MongoDB object

// Return an object property, return null if it's private (prefixed with _)
MObject.prototype.getProp = function(prop, callback) {
  if(prop[0] === '_') return {type: 'null', value: null};
  this._app.collections.objects.findOne({_id: this.id}, function(err, docs) {
    if(err) return callback(err);
    if(docs.length < 1) return callback(new Error('no object with id'));
    if(docs[0][prop] === undefined) return callback(null, {type: 'null', value: null});
    return callback(null, docs[0][prop]);
  }.bind(this));
}

// Set an object property, do nothing if it's private
MObject.prototype.setProp = function(prop, value, callback) {
  if(prop[0] === '_') return callback(null);
  var upd = {};
  upd[prop] = value;
  this._app.collections.objects.updateOne({_id: this.id}, upd, {upsert: true}, callback);
}

module.exports = MObject;
