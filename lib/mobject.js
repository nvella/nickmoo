var ObjectId = require('mongodb').ObjectId;
var NML = require('./nml');

// MObject = MOO Object
// Representation of a database game object in JS
var MObject = function(app, id) {
  this._app = app;
  this.id = id || new ObjectId();
  this.created = Math.floor(new Date() / 1000);
}

MObject.PROP_NO_READ  = ['_verbs', '_private'];
MObject.PROP_NO_WRITE = ['_id', '_created', '_children', '_inherit', '_owner'];
MObject.OBJ_SKEL = { // Blank object skeleton
  _verbs: {},                           // Verbs
  _private: [],                         // Private array properties
  _created: 0,                          // Object creation date (set this on #init)
  _children: {type: 'array', ctx: []},  // List of children object ID
  _inherit: null,                       // Inheritance parent (set this to root on #init, or an inheritance parent if provided)
  _owner: null,                         // Object's owner (set this to root on #init, set to object
                                        // creator when an object creates another object)
  name: 'object',                       // Primary object name
  aliases: {type: 'array', ctx: []},    // Object aliases
  desc: 'a blank, nondescript object'   // Object description, read by describe verb
}

// Init the object structure in the database
MObject.prototype.init = function(options, callback) {
  callback = callback || options;

  // Setup options hash
  options = typeof(options) === 'object' ? options : {};
  if(options.inherit !== undefined && options.inherit instanceof MObject)
    options.inherit = options.inherit.id;
  if(options.owner !== undefined && options.owner instanceof MObject)
    options.owner = options.owner.id;

  var doc = JSON.parse(JSON.stringify(MObject.OBJ_SKEL));
  doc._id      = this.id;
  doc._created = Math.floor(new Date() / 1000);
  doc._inherit = options.inherit || (this._app.rootObj || {}).id; // Set this object's inheritance parent to the root ID or inherit if provided
  doc._owner   = options.owner || (this._app.rootObj || {}).id; // Set this object's owner to root

  // Insert doc into DB
  // Using updateOne with upsert means that objects are overwritten when #init
  // is called twice
  this._app.collections.objects.updateOne({_id: this.id}, doc, {upsert: true}, callback);
};

// Get a verb's source from the database
MObject.prototype.getVerb = function(verb, callback) {
  this._app.collections.objects.findOne({_id: this.id}, function(err, doc) {
    if(err) return callback(err);
    var verbobj = doc._verbs[verb];
    if(verbobj === undefined) return callback(new Error('verb does not exist'));
    callback(null, verbobj);
  }.bind(this));
}

// Get a list of verbs
MObject.prototype.getVerbs = function(callback) {
  this._app.collections.objects.findOne({_id: this.id}, function(err, doc) {
    if(err) return callback(err);
    callback(null, Object.keys(doc._verbs));
  }.bind(this));
}

// Set a verb's source
MObject.prototype.setVerb = function(verb, src, callback) {
  // Attempt to parse the source so an error is raised on syntax errors
  try {
    NML.Parser.codeToAst(src);
  } catch(e) {
    return callback(e);
  }

  var upd = {$set: {}}; // Update document
  upd.$set['_verbs.' + verb] = {type: 'verb', src: src};

  this._app.collections.objects.updateOne({_id: this.id}, upd, callback);
}

// Delete a verb
MObject.prototype.delVerb = function(verb, callback) {
  var upd = {$unset: {}};
  upd.$unset['_verbs.' + verb] = '';

  this._app.collections.objects.findOne({_id: this.id}, function(err, doc) {
    if(err) return callback(err);
    if(doc._verbs[verb] === undefined) return callback(new Error('verb does not exist'));

    this._app.collections.objects.updateOne({_id: this.id}, upd, function(err, res) {
      if(err) return callback(err);
      if(res.modifiedCount < 1) return callback(new Error('verb does not exist'));
      return callback(null);
    }.bind(this));
  }.bind(this));
};

// Return an object property, return null if it's private (prefixed with _)
MObject.prototype.getProp = function(prop, callback) {
  if(MObject.PROP_NO_READ.indexOf(prop) >= 0) return callback(null, {type: 'null', value: null});
  this._app.collections.objects.findOne({_id: this.id}, function(err, doc) {
    if(err) return callback(err);
    if(doc === undefined || doc === null) return callback(new Error('no object with id'));
    if(doc[prop] === undefined) return callback(new Error('prop does not exist'));
    return callback(null, doc[prop]);
  }.bind(this));
}

// Set an object property, do nothing if it's private
MObject.prototype.setProp = function(prop, value, callback) {
  if(prop[0] === '_') return callback(null); // This works because all read-only and no-write props are prefixed with an underscore
  // TODO change to update modifier $set so the whole doc isn't replaced
  var upd = {$set: {}};
  upd.$set[prop] = value;
  this._app.collections.objects.updateOne({_id: this.id}, upd, {upsert: true}, callback);
}

// Delete a verb
MObject.prototype.delProp = function(prop, callback) {
  if(prop[0] === '_') return callback(new Error('prop cannot be deleted')); // This works because all read-only and no-write props are prefixed with an underscore

  var upd = {$unset: {}};
  upd.$unset[prop] = '';

  this._app.collections.objects.findOne({_id: this.id}, function(err, doc) {
    if(err) return callback(err);
    if(doc[prop] === undefined) return callback(new Error('prop does not exist'));

    this._app.collections.objects.updateOne({_id: this.id}, upd, function(err, res) {
      if(err) return callback(new Error(err));
      if(res.modifiedCount < 1) return callback(new Error('prop does not exist'));
      callback(null);
    }.bind(this));
  }.bind(this));
};

// Returns an array of object's children in MObjects
MObject.prototype.getChildren = function(callback) {
  this.getProp('_children', function(err, val) {
    if(err) return callback(err);
    if(typeof(val) != 'object' || val.type != 'array') return callback(new Error('_children property malformed'));
    return callback(null, val.ctx.map(function(id) { return this._app.mobj(id); }.bind(this)));
  }.bind(this));
};

// Adds a child object to this object's children.
MObject.prototype.addChild = function(id, callback) {
  if(id instanceof MObject) id = id.id; // set ID to the MObject's ID if provided with an MObject
  if(!(id instanceof ObjectId)) return callback(new Error('cannot add this type to the children list'));

  // Get the current list of MObjects
  this.getProp('_children', function(err, val) {
    // Push on the ID
    val.ctx.push(id);
    // Update it in the database
    this._app.collections.objects.updateOne({_id: this.id}, {$set: {_children: val}}, function(err, res) {
      if(err) return callback(err);
      callback(null);
    });
  }.bind(this));
};

// Finds an object's parent in the DB and creates an MObject.
MObject.prototype.getParent = function(callback) {
  this._app.collections.objects.findOne({'_children.ctx': {$in: [this.id]}}, function(err, doc) {
    if(err) return callback(err);
    if(doc === null) return callback(null, null);
    callback(null, this._app.mobj(doc._id));
  }.bind(this));
};

// Resolve a verb, searching up the inheritance tree
MObject.prototype.resolveVerb = function(verb, callback) {
  this.getProp('_inherit', function(err, inheritParent) {
    this.getVerb(verb, function(err, verbobj) {
      if(err && inheritParent !== null)
        return this._app.mobj(inheritParent).resolveVerb(verb, callback);
      if(err)
        return callback(new Error('verb does not exist'));
      return callback(null, verbobj);
    }.bind(this));
  }.bind(this));
};

// Create a VM using the verb name specified
MObject.prototype.vmFromVerb = function(verb, callback) {
  this.resolveVerb(verb, function(err, verbobj) {
    if(err) return callback(err);
    // TODO If the verb is native code, ask the app for the native 'VM'
    try {
      var ast = NML.Parser.codeToAst(verbobj.src);
    } catch(e) {
      return callback(e);
    }
    var vm = new NML.VM(this._app, this, ast);
    callback(null, vm);
  }.bind(this));
}

module.exports = MObject;
