var expect = require('chai').expect;
var MObject = require('../lib/mobject');
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

describe('MObject', function() {
  describe('constructor', function() {
    it('creates a new object id for itself when one isn\'t provided',
      function() {
      var mobj = new MObject();
      expect(mobj.id).to.be.an.instanceof(ObjectId);
    });

    it('sets the creation time to within a second of the object being created',
      function() {
      var mobj = new MObject();
      var now = new Date() / 1000;
      expect(mobj.created).to.be.gte(now - 1);
      expect(mobj.created).to.be.lte(now + 1);
    });
  });

  describe('#load', function() {
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

    it('can load it\'s state from a mongodb document', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.load(function(err) {
        expect(err).to.be.null;
        done();
      });
    });

    it('can load properties', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.load(function(err) {
        expect(err).to.be.null;
        expect(mobj.props.ayy).to.equal('lmao');
        done();
      });
    });

    it('can load verbs', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.load(function(err) {
        expect(err).to.be.null;
        expect(mobj.verbs._step).to.not.be.undefined;
        expect(mobj.verbs._step.src).to.equal('$a = 1');
        done();
      });
    });

    it('can load the creation time', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.load(function(err) {
        expect(err).to.be.null;
        expect(mobj.created).to.equal(12345);
        done();
      });
    });
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

      mobj.load(function(err) {
        expect(err).to.be.null;
        expect(mobj.getProp('ayy')).to.equal('lmao');
        done();
      });
    });

    it('returns NML null on any property prefixed with an _', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.load(function(err) {
        expect(err).to.be.null;
        expect(mobj.getProp('_created')).to.eql({type: 'null', value: null});
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
            _created: 12345,
            ayy: 'lmao'
          }]
        )
      }
    };

    it('can set an object property', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.load(function(err) {
        expect(err).to.be.null;
        mobj.setProp('ayy', 'memes');
        expect(mobj.getProp('ayy')).to.equal('memes');
        done();
      });
    });

    it('doesn\'t set props prefixed with _', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.load(function(err) {
        expect(err).to.be.null;
        mobj.setProp('_test', 'test');
        expect(mobj.props._test).to.be.undefined;
        done();
      });
    });
  });
});
