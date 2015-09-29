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

    it('returns NML null on a no-read property', function(done) {
      var mobj = new MObject(app);
      app.collections.objects.spec[0]._id = mobj.id;

      mobj.load(function(err) {
        expect(err).to.be.null;
        expect(mobj.getProp('_verbs')).to.eql({type: 'null', value: null});
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

      mobj.setProp('ayy', 'memes', function(err) {
        expect(err).to.be.null;
        expect(app.collections.objects.spec[0].ayy).to.equal('memes');
        done();
      });
    });

    it('doesn\'t set no-read props', function(done) {
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
