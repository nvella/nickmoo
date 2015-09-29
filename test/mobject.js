var expect = require('chai').expect;
var MObject = require('../lib/mobject');
var NML = require('../lib/nml');
var NMLSyntaxError = NML.Errors.NMLSyntaxError;
var ObjectId = require('mongodb').ObjectId;

function FakeMongoCollection(spec) {
  this.spec = spec || [];
}

// only finds by id
FakeMongoCollection.prototype.findOne = function(queryDoc, callback) {
  for(var obj of this.spec) {
    if(obj._id == queryDoc._id) return callback(null, [obj]);
  }
  callback(null, []);
};

FakeMongoCollection.prototype.updateOne = function(queryDoc, doc, options, callback) {
  var cb = callback || options;
  var ops = typeof(options) === 'object' ? options : {};
  for(var obj of this.spec) {
    if(obj._id == queryDoc._id) {
      for(var prop in doc) { obj[prop] = doc[prop]; }
      return cb(null);
    }
  }
  if(ops.upsert) {
    doc._id = queryDoc._id;
    this.spec.push(doc);
    return cb(null);
  }
  cb(new Error('no docs match'));
};

FakeMongoCollection.prototype.insertOne = function(doc, callback) {
  this.spec.push(doc);
  callback();
};

describe('MObject', function() {
  describe('constructor', function() {
    it('creates a new object id for itself when one isn\'t provided',
      function() {
      var mobj = new MObject();
      expect(mobj.id).to.be.an.instanceof(ObjectId);
    });
  });

  describe('#getVerb', function() {
    var app = {
      collections: {
        objects: new FakeMongoCollection(
          [{
            _verbs: {
              _step: '$a = 1',
            },
            _created: 12345,
            ayy: 'lmao'
          }]
        )
      }
    };

    it('can retreive verb source from the db', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.getVerb('_step', function(err, src) {
        expect(err).to.be.null;
        expect(src).to.be.equal('$a = 1');
        done();
      });
    });

    it('returns an error when the verb doesn\'t exist', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.getVerb('_blah', function(err, src) {
        expect(err).to.be.an.instanceof(Error);
        expect(err.message).to.equal('verb does not exist');
        expect(src).to.be.undefined;
        done();
      });
    });
  });

  describe('#getVerbs', function() {
    var app = {
      collections: {
        objects: new FakeMongoCollection(
          [{
            _verbs: {
              _step: '$a = 1',
              put: '$a = 2'
            },
            _created: 12345,
            ayy: 'lmao'
          }]
        )
      }
    };

    it('can return a list of verbs', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.getVerbs(function(err, verbs) {
        expect(err).to.be.null;
        expect(verbs).to.be.an('array');
        expect(verbs).to.eql(['_step', 'put']);
        done();
      });
    });
  });

  describe('#vmFromVerb', function() {
    var app = {
      collections: {
        objects: new FakeMongoCollection(
          [{
            _verbs: {
              _step: '$a = 1',
              badSyntax: 'if\n$a = 1\nend'
            },
            _created: 12345,
            ayy: 'lmao'
          }]
        )
      }
    };

    it('can create a VM with the provided verb\'s source', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.vmFromVerb('_step', function(err, vm) {
        expect(err).to.be.null;
        expect(vm).to.be.an.instanceof(NML.VM);
        expect(vm.state.ast).to.eql([{type: 'assign', op: '=', src: [1], dst: {type: 'var', name: 'a'}}]);
        done();
      });
    });

    it('returns an error when the verb doesn\'t exist', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.vmFromVerb('_blah', function(err, vm) {
        expect(err).to.be.an.instanceof(Error);
        expect(err.message).to.equal('verb does not exist');
        expect(vm).to.be.undefined;
        done();
      });
    });

    it('returns an error on parser syntax error', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.vmFromVerb('badSyntax', function(err, vm) {
        expect(err).to.be.an.instanceof(NMLSyntaxError);
        expect(err.message).to.equal('line 1: if usage: if <expr>');
        expect(vm).to.be.undefined;
        done();
      });
    })
  });

  describe('#getProp', function() {
    var app = {
      collections: {
        objects: new FakeMongoCollection(
          [{
            _verbs: {
              _step: '$a = 1'
            },
            _created: 12345,
            ayy: 'lmao'
          }]
        )
      }
    };

    it('can retrieve an object property', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.getProp('ayy', function(err, value) {
        expect(err).to.be.null;
        expect(value).to.equal('lmao');
        done();
      });
    });

    it('returns NML null on a no-read property', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.getProp('_verbs', function(err, value) {
        expect(err).to.be.null;
        expect(value).to.eql({type: 'null', value: null});
        done();
      });
    });

    it('can retrieve a read-only property', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.getProp('_created', function(err, value) {
        expect(err).to.be.null;
        expect(value).to.eql(12345);
        done();
      });
    });
  });

  describe('#setProp', function() {
    var app = {
      collections: {
        objects: new FakeMongoCollection(
          [{
            _verbs: {
              _step: '$a = 1'
            },
            _created: 12345
          }]
        )
      }
    };

    it('can set an object property', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.setProp('test', '1234', function(err) {
        expect(err).to.be.null;
        expect(app.collections.objects.spec[0].test).to.equal('1234');
        done();
      });
    });

    it('doesn\'t set no-read props', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.setProp('_verbs', 'ayy', function(err) {
        expect(err).to.be.null;
        expect(app.collections.objects.spec[0]._verbs).to.be.a('object');
        done();
      });
    });

    it('doesn\'t set read-only props', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.setProp('_created', 'ayy', function(err) {
        expect(err).to.be.null;
        expect(app.collections.objects.spec[0]._created).to.equal(12345);
        done();
      });
    });
  });
});
