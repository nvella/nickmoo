var expect = require('chai').expect;
var async  = require('async');

var MObject = require('../lib/mobject');
var NML = require('../lib/nml');
var NMLSyntaxError = NML.Errors.NMLSyntaxError;

var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectId;

describe('MObject', function() {

  var app, db, mobj;

  beforeEach(function(done) {
    async.series([
      function(cb) {
        MongoClient.connect('mongodb://127.0.0.1:27017/nickmoo-test', function(err, _db) {
          if(err) throw err;
          db = _db;
          app = { collections: { objects: db.collection('objects') } };
          cb();
        });
      },
      function(cb) {db.collection('objects').deleteMany({}, cb);}, // Remove everything in the objects collection
      function(cb) {
        db.collection('objects').insertOne({
          _verbs: {
            _step: '$a = 1',
            put: '$a = 2',
            badSyntax: 'if\n$a = 1\nend'
          },
          _created: 12345,
          ayy: 'lmao'
        }, function(err, res) {
          if(err) return done(err);
          // Find the id and create a new MObject with it
          mobj = new MObject(app, res.insertedId);
          cb();
        }); // Insert some dummy data
      },
      function() { done(); }
    ]);
  });

  afterEach(function(done) {
    db.close(false, done);
  });

  describe('constructor', function() {
    it('creates a new object id for itself when one isn\'t provided',
      function() {
      mobj = new MObject();
      expect(mobj.id).to.be.an.instanceof(ObjectId);
    });
  });

  describe('#getVerb', function() {
    it('can retreive verb source from the db', function(done) {
      mobj.getVerb('_step', function(err, src) {
        expect(err).to.be.null;
        expect(src).to.be.equal('$a = 1');
        done();
      });
    });

    it('returns an error when the verb doesn\'t exist', function(done) {
      mobj.getVerb('_blah', function(err, src) {
        expect(err).to.be.an.instanceof(Error);
        expect(err.message).to.equal('verb does not exist');
        expect(src).to.be.undefined;
        done();
      });
    });
  });

  describe('#getVerbs', function() {
    it('can return a list of verbs', function(done) {
      mobj.getVerbs(function(err, verbs) {
        expect(err).to.be.null;
        expect(verbs).to.be.an('array');
        expect(verbs).to.eql(['_step', 'put', 'badSyntax']);
        done();
      });
    });
  });

  describe('#setVerb', function() {
    it('can set a verb\'s source', function(done) {
      mobj.setVerb('_step', '$a = 4', function(err) {
        expect(err).to.be.null;
        app.collections.objects.findOne({_id: mobj.id}, function(err, doc) {
          expect(doc._verbs._step).to.equal('$a = 4');
          done();
        });
      });
    });

    it('returns an error when trying to set bad syntax', function(done) {
      mobj.setVerb('_step', '$a = (test]', function(err) {
        expect(err).to.be.an.instanceof(NMLSyntaxError);
        mobj.getVerb('_step', function(err, src) {
          expect(src).to.equal('$a = 1');
          done();
        });
      });
    });
  });

  describe('#delVerb', function() {
    it('can delete a verb', function(done) {
      mobj.delVerb('_step', function(err) {
        expect(err).to.be.null;
        app.collections.objects.findOne({_id: mobj.id}, function(err, doc) {
          expect(doc._verbs._step).to.be.undefined;
          done();
        });
      });
    });

    it('returns an error when the verb doesn\'t exist', function(done) {
      mobj.delVerb('asdf', function(err) {
        expect(err).to.be.an.instanceof(Error);
        expect(err.message).to.equal('verb does not exist');
        done();
      });
    });
  });

  describe('#vmFromVerb', function() {
    it('can create a VM with the provided verb\'s source', function(done) {
      mobj.vmFromVerb('_step', function(err, vm) {
        expect(err).to.be.null;
        expect(vm).to.be.an.instanceof(NML.VM);
        expect(vm.state.ast).to.eql([{type: 'assign', op: '=', src: [1], dst: {type: 'var', name: 'a'}}]);
        done();
      });
    });

    it('returns an error when the verb doesn\'t exist', function(done) {
      mobj.vmFromVerb('_blah', function(err, vm) {
        expect(err).to.be.an.instanceof(Error);
        expect(err.message).to.equal('verb does not exist');
        expect(vm).to.be.undefined;
        done();
      });
    });

    it('returns an error on parser syntax error', function(done) {
      mobj.vmFromVerb('badSyntax', function(err, vm) {
        expect(err).to.be.an.instanceof(NMLSyntaxError);
        expect(err.message).to.equal('line 1: if usage: if <expr>');
        expect(vm).to.be.undefined;
        done();
      });
    })
  });

  describe('#getProp', function() {
    it('can retrieve an object property', function(done) {
      mobj.getProp('ayy', function(err, value) {
        expect(err).to.be.null;
        expect(value).to.equal('lmao');
        done();
      });
    });

    it('returns NML null on a no-read property', function(done) {
      mobj.getProp('_verbs', function(err, value) {
        expect(err).to.be.null;
        expect(value).to.eql({type: 'null', value: null});
        done();
      });
    });

    it('can retrieve a read-only property', function(done) {
      mobj.getProp('_created', function(err, value) {
        expect(err).to.be.null;
        expect(value).to.eql(12345);
        done();
      });
    });
  });

  describe('#setProp', function() {
    it('can set an object property', function(done) {
      mobj.setProp('test', '1234', function(err) {
        expect(err).to.be.null;
        mobj.getProp('test', function(err, value) {
          expect(value).to.equal('1234');
          done();
        });
      });
    });

    it('doesn\'t set no-read props', function(done) {
      mobj.setProp('_verbs', 'ayy', function(err) {
        expect(err).to.be.null;
        app.collections.objects.findOne({_id: mobj.id}, function(err, doc) {
          expect(doc._verbs).to.be.a('object');
          done();
        });
      });
    });

    it('doesn\'t set read-only props', function(done) {
      mobj.setProp('_created', 'ayy', function(err) {
        expect(err).to.be.null;
        app.collections.objects.findOne({_id: mobj.id}, function(err, doc) {
          expect(doc._created).to.equal(12345);
          done();
        });
      });
    });
  });

  describe('#delProp', function() {
    it('can delete a prop', function(done) {
      mobj.delProp('ayy', function(err) {
        expect(err).to.be.null;
        app.collections.objects.findOne({_id: mobj.id}, function(err, doc) {
          expect(doc.ayy).to.be.undefined;
          done();
        });
      });
    });

    it('returns an error when the prop doesn\'t exist', function(done) {
      mobj.delProp('asdf', function(err) {
        expect(err).to.be.an.instanceof(Error);
        expect(err.message).to.equal('prop does not exist');
        done();
      });
    });

    it('doesn\'t delete no-read props', function(done) {
      mobj.delProp('_verbs', function(err) {
        expect(err).to.be.an.instanceof(Error);
        expect(err.message).to.equal('prop cannot be deleted');
        app.collections.objects.findOne({_id: mobj.id}, function(err, doc) {
          expect(doc._verbs).to.be.a('object');
          done();
        });
      });
    });

    it('doesn\'t delete read-only props', function(done) {
      mobj.delProp('_created', function(err) {
        expect(err).to.be.an.instanceof(Error);
        expect(err.message).to.equal('prop cannot be deleted');
        app.collections.objects.findOne({_id: mobj.id}, function(err, doc) {
          expect(doc._created).to.equal(12345);
          done();
        });
      });
    });
  });
});
