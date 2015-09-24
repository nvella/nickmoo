var ObjectId = require('mongodb').ObjectId;

// MObject = MOO Object
// Representation of a database game object in JS
var MObject = function(app, id) {
  this._app = app;
  this.id = id || new ObjectId();
  this.props = {};
  this.verbs = {};
  this.created = Math.floor(new Date() / 1000);
}

// Loads state into the MObject from the DB
// Callback is called once the information has been loaded from the database
MObject.prototype.load = function(callback) {
  this._app.collections.objects.findOne({_id: this.id}, function(err, result) {
    if(err) return callback(err);
    if(result.length < 1) return callback('no object with id');
    var doc = result[0];

    this.props   = doc.props;
    this.created = doc.created;

    // Load verbs
    for(var verb in doc.verbs) {
      this.verbs[verb] = {
        src: doc.verbs[verb],
        vm: null // TODO vm integration
      }
    }

    callback();
  })
}

// Saves this state into the DB
MObject.prototype.save = function(callback) {
  // Create the document
  var doc = {
    props: this.props,
    verbs: {},
    created: created
  };

  // Just save the source for the verbs
  for(var verb of this.verbs) {
    doc.verbs[verb] = verb.src;
  }

  this._app.collections.objects.updateOne({_id: this.id}, doc, {upsert: true}, callback);
}

module.exports = MObject;
