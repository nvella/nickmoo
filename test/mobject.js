var expect = require('chai').expect;
var async  = require('async');

var MObject = require('../lib/mobject');
var NML = require('../lib/nml');
var NMLSyntaxError = NML.Errors.NMLSyntaxError;

var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectId;

describe('MObject', function() {

  var app, db, mobj, inheritObjId, childMobj, childMobj2, mobjChildren;

  beforeEach(function(done) {
    this.timeout(5000); // Set timeout to 5 seconds, as Travis may take a while
                        // to get mongo set up.

    async.series([
      function(cb) {
        mobjChildren = {type: 'array', ctx: []};

        MongoClient.connect('mongodb://127.0.0.1:27017/nickmoo-test', function(err, _db) {
          if(err) throw err;
          db = _db;
          app = {
            rootObj: new MObject(),
            collections: { objects: db.collection('objects') },
            mobj: function(id) {
              switch (typeof(id)) {
                case 'string':
                  return new MObject(this, new ObjectId(id));
                case 'object':
                  if(id instanceof ObjectId) return new MObject(this, id);
                  // Otherwise, fall through to default
                default:
                  return new MObject(this); // Just return a new mobject
              }
            }
          };
          cb();
        });
      },
      function(cb) {db.collection('objects').deleteMany({}, cb);}, // Remove everything in the objects collection
      function(cb) { // Create an inheritance parent
        db.collection('objects').insertOne({
          _verbs: {
            test: {type: 'verb', src: '$a = 1234'},
          },
          _created: 12345,
          _inherit: null,
        }, function(err, res) {
          if(err) return done(err);
          // Find the id and create a new MObject with it
          inheritObjId = res.insertedId;
          cb();
        }); // Insert some dummy data
      },
      function(cb) { // Create an object that will be a child of the standard object
        db.collection('objects').insertOne({
          _verbs: {
            childVerb: {type: 'verb', src: '$a = 1'}
          },
          _children: [],
          _created: 12345,
          _inherit: inheritObjId,
          name: 'child object',
          aliases: {type: 'array', ctx: ['foo', 'foo bar', 'foo baz']},
          ayy: 'testing'
        }, function(err, res) {
          if(err) return done(err);
          mobjChildren.ctx.push(res.insertedId);
          childMobj = new MObject(app, res.insertedId);
          cb();
        }); // Insert some dummy data
      },
      function(cb) { // Create another object that will be a child of the standard object
        db.collection('objects').insertOne({
          _verbs: {
          },
          _children: [],
          _created: 12345,
          _inherit: inheritObjId,
          name: 'testobj',
          aliases: {type: 'array', ctx: []}
        }, function(err, res) {
          if(err) return done(err);
          mobjChildren.ctx.push(res.insertedId);
          childMobj2 = new MObject(app, res.insertedId);
          cb();
        }); // Insert some dummy data
      },
      function(cb) { // Create a standard object
        db.collection('objects').insertOne({
          _verbs: {
            _step: {type: 'verb', src: '$a = 1'},
            put: {type: 'verb', src: '$a = 2'},
            badSyntax: {type: 'verb', src: 'if\n$a = 1\nend'}
          },
          _children: mobjChildren,
          _created: 12345,
          _inherit: inheritObjId,
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

  describe('#init', function() {
    it('can init a blank object in the db', function(done) {
      mobj = new MObject(app);
      mobj.init(function(err) {
        expect(err).to.be.null;
        app.collections.objects.findOne({_id: mobj.id}, function(err, doc) {
          expect(doc._id.equals(mobj.id)).to.be.true;

          // Check some basic things, we can't check it 1:1 with OBJ_SKEL as
          // #init modifies the skeleton (_created, _parent)
          expect(doc._children).to.eql(MObject.OBJ_SKEL._children);
          expect(doc._created).to.not.be.zero;
          // Check if the rootId was set correctly
          expect(doc._inherit.toString()).to.equal(app.rootObj.id.toString());
          expect(doc._owner.toString()).to.equal(app.rootObj.id.toString());

          done();
        });
      });
    });

    it('can set the inheritance parent and owner to root', function(done) {
      mobj = new MObject(app);
      mobj.init(function(err) {
        expect(err).to.be.null;
        app.collections.objects.findOne({_id: mobj.id}, function(err, doc) {
          // Check if the rootId was set correctly
          expect(doc._inherit.toString()).to.equal(app.rootObj.id.toString());
          expect(doc._owner.toString()).to.equal(app.rootObj.id.toString());

          done();
        });
      });
    });

    it('can set the created date to within a second of init', function(done) {
      mobj = new MObject(app);
      var date = Math.floor(new Date() / 1000);

      mobj.init(function(err) {
        expect(err).to.be.null;
        app.collections.objects.findOne({_id: mobj.id}, function(err, doc) {
          expect(doc._created).to.be.gte(date - 1);
          expect(doc._created).to.be.lte(date + 1);
          done();
        });
      });
    });

    it('can overwrite an object when it already exists', function(done) {
      app.collections.objects.findOne({_id: mobj.id}, function(err, doc) {
        expect(doc.ayy).to.equal('lmao');
        mobj.init(function(err) {
          expect(err).to.be.null;
          app.collections.objects.findOne({_id: mobj.id}, function(err, doc) {
            expect(doc.ayy).to.be.undefined;
            done();
          });
        });
      });
    });

    it('can call the callback when options are provided', function(done) {
      mobj = new MObject(app);

      mobj.init({}, function(err) {
        done();
      });
    });

    it('can set the inheritance parent when an object id is provided', function(done) {
      mobj = new MObject(app);
      var id = new ObjectId();

      mobj.init({inherit: id}, function(err) {
        mobj.getProp('_inherit', function(err, value) {
          expect(value.toString()).to.equal(id.toString());
          done();
        });
      });
    });

    it('can set the inheritance parent when another mobj is provided', function(done) {
      mobj = new MObject(app);
      var aMobj = new MObject(app);

      mobj.init({inherit: aMobj}, function(err) {
        mobj.getProp('_inherit', function(err, value) {
          expect(value.toString()).to.equal(aMobj.id.toString());
          done();
        });
      });
    });

    it('can set the owner when an object id is provided', function(done) {
      mobj = new MObject(app);
      var id = new ObjectId();

      mobj.init({owner: id}, function(err) {
        mobj.getProp('_owner', function(err, value) {
          expect(value.toString()).to.equal(id.toString());
          done();
        });
      });
    });

    it('can set the owner when another mobj is provided', function(done) {
      mobj = new MObject(app);
      var aMobj = new MObject(app);

      mobj.init({owner: aMobj}, function(err) {
        mobj.getProp('_owner', function(err, value) {
          expect(value.toString()).to.equal(aMobj.id.toString());
          done();
        });
      });
    });
  });

  describe('#delete', function() {
    it('can delete the object from the database', function(done) {
      mobj.delete(function(err) {
        expect(err).to.be.null;
        app.collections.objects.findOne({_id: mobj.id}, function(err, doc) {
          expect(doc).to.be.null;
          done();
        });
      });
    });

    it('returns an error when the object doesn\'t exist', function(done) {
      app.mobj().delete(function(err) {
        expect(err).to.not.be.null;
        expect(err.message).to.equal('object does not exist');
        done();
      });
    });
  });

  describe('#getVerb', function() {
    it('can retreive verb source from the db', function(done) {
      mobj.getVerb('_step', function(err, verb) {
        expect(err).to.be.null;
        expect(verb).to.be.eql({type: 'verb', src: '$a = 1'});
        done();
      });
    });

    it('returns an error when the verb doesn\'t exist', function(done) {
      mobj.getVerb('_blah', function(err, verb) {
        expect(err).to.be.an.instanceof(Error);
        expect(err.message).to.equal('verb does not exist');
        expect(verb).to.be.undefined;
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
          expect(doc._verbs._step).to.eql({type: 'verb', src: '$a = 4'});
          done();
        });
      });
    });

    it('returns an error when trying to set bad syntax', function(done) {
      mobj.setVerb('_step', '$a = (test]', function(err) {
        expect(err).to.be.an.instanceof(NMLSyntaxError);
        mobj.getVerb('_step', function(err, verb) {
          expect(verb).to.eql({type: 'verb', src: '$a = 1'});
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

    it('returns an error when the prop does not exist', function(done) {
      mobj.getProp('doesntExist', function(err, value) {
        expect(err).to.not.be.null;
        expect(err.message).to.equal('prop does not exist');
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

  describe('#getChildren', function() {
    it('can return an array of all the children IDs in MObjects', function(done) {
      mobj.getChildren(function(err, children) {
        expect(err).to.be.null;
        expect(children).to.be.an.array;
        expect(children[0]).to.be.an.instanceof(MObject);
        expect(children[1]).to.be.an.instanceof(MObject);
        expect(children[0].id.toString()).to.equal(mobjChildren.ctx[0].toString());
        expect(children[1].id.toString()).to.equal(mobjChildren.ctx[1].toString());
        done();
      });
    });

    it('returns an error when the _children prop doesn\'t exist', function(done) {
      app.collections.objects.updateOne({_id: mobj.id}, {$unset: {_children: ''}}, function(err, doc) {
        mobj.getChildren(function(err, children) {
          expect(err).to.not.be.null;
          expect(err.message).to.equal('prop does not exist');
          done();
        });
      });
    });

    it('returns an error when the _children prop is malformed', function(done) {
      app.collections.objects.updateOne({_id: mobj.id}, {$set: {_children: 1234}}, function(err, doc) {
        mobj.getChildren(function(err, children) {
          expect(err).to.not.be.null;
          expect(err.message).to.equal('_children property malformed');
          done();
        });
      });
    });
  });

  describe('#addChild', function() {
    it('can add an MObject to the children list', function(done) {
      var id = new ObjectId();
      mobj.addChild(new MObject(app, id), function(err) {
        mobj.getChildren(function(err, children) {
          expect(children.slice(-1)[0].id.toString()).to.equal(id.toString());
          done();
        });
      });
    });

    it('can add an ObjectId to the children list', function(done) {
      var id = new ObjectId();
      mobj.addChild(id, function(err) {
        mobj.getChildren(function(err, children) {
          expect(children.slice(-1)[0].id.toString()).to.equal(id.toString());
          done();
        });
      });
    });

    it('returns an error when trying to add an invalid value', function(done) {
      mobj.addChild(1234, function(err) {
        expect(err).to.not.be.null;
        expect(err.message).to.equal('cannot add this type to the children list');
        done();
      });
    });
  });

  describe('#getParent', function() {
    it('can return an MObject of an object\'s parent', function(done) {
      childMobj.getParent(function(err, parent) {
        expect(err).to.be.null;
        expect(parent).to.be.an.instanceof(MObject);
        expect(parent.id.toString()).to.equal(mobj.id.toString());
        done();
      });
    });

    it('returns null when the object has no parent', function(done) {
      mobj.getParent(function(err, parent) {
        expect(err).to.be.null;
        expect(parent).to.be.null;
        done();
      });
    });
  });

  describe('#resolveVerb', function() {
    it('can return the verb object of a local verb', function(done) {
      mobj.resolveVerb('_step', function(err, verb) {
        expect(err).to.be.null;
        expect(verb).to.be.a('object');
        expect(verb).to.eql({type: 'verb', src: '$a = 1'});
        done();
      });
    });

    it('can return the verb object of an inherited verb', function(done) {
      mobj.resolveVerb('test', function(err, verb) {
        expect(err).to.be.null;
        expect(verb).to.be.a('object');
        expect(verb).to.eql({type: 'verb', src: '$a = 1234'});
        done();
      });
    });

    it('returns an error when the verb cannot be found', function(done) {
      mobj.resolveVerb('notfound', function(err, verb) {
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

  describe('#resolveChildObj', function() {
    it('can resolve a child object by it\'s name', function(done) {
      mobj.resolveChildObj('child object', function(err, mobj) {
        expect(err).to.be.null;
        expect(mobj).to.be.an.instanceof(MObject);
        expect(mobj.id.toString()).to.equal(childMobj.id.toString());
        done();
      });
    });

    it('can resolve a child object by one of it\'s aliases', function(done) {
      mobj.resolveChildObj('foo baz', function(err, mobj) {
        expect(err).to.be.null;
        expect(mobj).to.be.an.instanceof(MObject);
        expect(mobj.id.toString()).to.equal(childMobj.id.toString());
        done();
      });
    });

    it('can accept an array for the name', function(done) {
      mobj.resolveChildObj(['child', 'object'], function(err, mobj) {
        expect(err).to.be.null;
        expect(mobj).to.be.an.instanceof(MObject);
        expect(mobj.id.toString()).to.equal(childMobj.id.toString());
        done();
      });
    });

    it('returns null when no object was found', function(done) {
      mobj.resolveChildObj('banana', function(err, mobj) {
        expect(err).to.be.null;
        expect(mobj).to.be.null;
        done();
      });
    });
  });

  describe('#verbcall', function() {
    it('can create a vm from a local verbcall', function(done) {
      var dirObj = new ObjectId();
      var indirObj = new ObjectId();
      var verbcall = {
        type: 'verbcall',
        verb: 'put',
        directObj: dirObj,
        prepos: 'in',
        indirectObj: indirObj,
        params: [dirObj, 'in', indirObj]
      };

      mobj.verbcall(verbcall, function(err, vm) {
        expect(err).to.be.null;
        expect(vm).to.be.an.instanceof(NML.VM);
        expect(vm.mobj.id.toString()).to.equal(mobj.id.toString());
        expect(vm.state.ast).to.eql([{ type: 'assign', op: '=', src: [ 2 ], dst: { type: 'var', name: 'a' } }]);
        expect(vm.state.localVars).to.eql({
          _verb: 'put',
          _directObj: dirObj,
          _prepos: 'in',
          _indirectObj: indirObj,
          _params: [dirObj, 'in', indirObj],
          _caller: mobj.id
        });
        done();
      });
    });

    it('returns an error when the verb doesn\'t exist', function(done) {
      var dirObj = new ObjectId();
      var indirObj = new ObjectId();
      var verbcall = {
        type: 'verbcall',
        verb: 'noExist',
        directObj: dirObj,
        prepos: 'in',
        indirectObj: indirObj,
        params: [dirObj, 'in', indirObj]
      };

      mobj.verbcall(verbcall, function(err, vm) {
        expect(err).to.be.an.instanceof(Error);
        expect(err.message).to.equal('verb does not exist');
        done();
      });
    });

    it('can search up the inheritance tree for a local verb', function(done) {
      var dirObj = new ObjectId();
      var indirObj = new ObjectId();
      var verbcall = {
        type: 'verbcall',
        verb: 'test',
        directObj: dirObj,
        prepos: 'in',
        indirectObj: indirObj,
        params: [dirObj, 'in', indirObj]
      };

      mobj.verbcall(verbcall, function(err, vm) {
        expect(err).to.be.null;
        expect(vm).to.be.an.instanceof(NML.VM);
        expect(vm.mobj.id.toString()).to.equal(mobj.id.toString());
        expect(vm.state.localVars._caller.toString()).to.equal(mobj.id.toString());
        expect(vm.state.ast).to.eql([{ type: 'assign', op: '=', src: [ 1234 ], dst: { type: 'var', name: 'a' } }]);
        expect(vm.state.localVars).to.eql({
          _verb: 'test',
          _directObj: dirObj,
          _prepos: 'in',
          _indirectObj: indirObj,
          _params: [dirObj, 'in', indirObj],
          _caller: mobj.id
        });
        done();
      });
    });

    it('can search the parent object for a verb', function(done) {
      var dirObj = new ObjectId();
      var indirObj = new ObjectId();
      var verbcall = {
        type: 'verbcall',
        verb: 'put',
        directObj: dirObj,
        prepos: 'in',
        indirectObj: indirObj,
        params: [dirObj, 'in', indirObj]
      };

      childMobj.verbcall(verbcall, function(err, vm) {
        expect(err).to.be.null;
        expect(vm).to.be.an.instanceof(NML.VM);
        // The VM is created in the context of the parent object, where the verb exists
        expect(vm.mobj.id.toString()).to.equal(mobj.id.toString());
        expect(vm.state.localVars._caller.toString()).to.equal(childMobj.id.toString());
        expect(vm.state.ast).to.eql([{type: 'verb', src: '$a = 2'}]);
        expect(vm.state.localVars).to.eql({
          _verb: 'put',
          _directObj: dirObj,
          _prepos: 'in',
          _indirectObj: indirObj,
          _params: [dirObj, 'in', indirObj]
        });
        done();
      });
    });

    it('can resolve objects referenced by name to ids',
      function(done) {
      var indirObj = new ObjectId();
      var verbcall = {
        type: 'verbcall',
        verb: 'put',
        directObj: ['child', 'object'],
        prepos: 'in',
        indirectObj: ['testobj'],
        params: ['child', 'object', 'in', 'testobj']
      };

      mobj.verbcall(verbcall, function(err, vm) {
        expect(err).to.be.null;
        expect(vm).to.be.an.instanceof(NML.VM);
        // The VM is created in the context of the direct object mentioned, where the verb exists
        expect(vm.mobj.id.toString()).to.equal(mobj.id.toString());
        expect(vm.state.ast).to.eql([{ type: 'assign', op: '=', src: [ 2 ], dst: { type: 'var', name: 'a' } }]);
        expect(vm.state.localVars._caller.toString()).to.equal(mobj.id.toString());
        expect(vm.state.localVars._verb).to.equal('put');
        expect(vm.state.localVars._directObj.toString()).to.equal(childMobj.id.toString());
        expect(vm.state.localVars._prepos).to.equal('in');
        expect(vm.state.localVars._indirectObj.toString()).to.equal(childMobj2.id.toString());
        expect(vm.state.localVars._params).to.eql(['child', 'object', 'in', 'testobj']);
        done();
      });
    });

    // TODO tests for referring verb on nearby object
  });
});
