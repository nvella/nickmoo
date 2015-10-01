var net = require('net');
var expect = require('chai').expect;
var NickMOO = require('../lib/nickmoo');
var ObjectId = require('mongodb').ObjectId;
var async = require('async');

describe('NickMOO', function() {
  var config = {
    port: 54321,
    dbUri: "mongodb://127.0.0.1:27017/nickmoo",
    serverName: "NickMOO Development"
  };

  var nickmoo;
  this.timeout(5000);

  beforeEach(function() {
    nickmoo = new NickMOO(config);
    nickmoo.log = function() {};
  });

  describe('#init', function() {
    it('can initialize the MOO server', function(done) {
      nickmoo.init(function() {
        nickmoo.deinit(function() {
          done();
        });
      });
    });

    it('can accept a connection', function(done) {
      var messages = [];
      nickmoo.log = function(str) {
        messages.push(str);
      };
      nickmoo.init(function() {
        var client = net.connect({port: config.port}, function() {
          async.series([
            // process.nextTick doesn’t work here for some reason, possibly
            // event loop magic with process.nextTick vs setTimeout priorities
            function(cb) { setTimeout(cb, 0); },
            function(cb) { expect(nickmoo.connections).to.not.be.empty; cb(); },
            function(cb) { client.end(cb); },
            function(cb) { nickmoo.deinit(cb); },
            function(cb) { setTimeout(cb, 0); },
            function() {
              expect(messages).to.include('accepted connection from ::ffff:127.0.0.1:54321');
              expect(messages).to.include('connection ::ffff:127.0.0.1:54321 deinit');
              done();
            }
          ]);
        });
      });
    });
  });

  describe('#deinit', function() {
    it('can close all active connections', function(done) {
      var messages = [];
      nickmoo.log = function(str) {
        messages.push(str);
      };

      nickmoo.init(function() {
        var client = net.connect({port: config.port}, function() {
          async.series([
            function(cb) { setTimeout(cb, 0); },
            function(cb) { nickmoo.deinit(cb); },
            function(cb) {
              expect(messages).to.include('connection ::ffff:127.0.0.1:54321 deinit');
              expect(nickmoo.connections).to.be.empty;
              cb();
            },
            function() {
              client.end();
              done();
            }
          ]);
        });
      });
    });

    it('doesn\'t allow new tcp clients to connect', function(done) {
      var messages = [];
      nickmoo.log = function(str) {
        messages.push(str);
      };

      async.series([
        function(cb) { nickmoo.init(cb); },
        function(cb) { nickmoo.deinit(cb); },
        function() {
          expect(function() { net.connect({port: config.port}) }).to.throw.error;
          done();
        }
      ]);
    });

    it('can close the database connection', function(done) {
      var messages = [];
      nickmoo.log = function(str) {
        messages.push(str);
      };

      async.series([
        function(cb) { nickmoo.init(cb); },
        function(cb) { nickmoo.deinit(cb); },
        function() {
          nickmoo.db.stats({}, function(err) {
            expect(err).to.not.be.null;
            expect(err).to.not.be.undefined;
            done();
          });
        }
      ]);
    });
  });

  describe('#mobj', function() {
    it('returns an MObject with a provided ObjectId', function() {
      var id = new ObjectId();
      expect(nickmoo.mobj(id).id).to.equal(id);
    });

    it('can convert a provided str ObjId to a MObject', function() {
      var id = '012345678901234567890123';
      expect(nickmoo.mobj(id).id.toString()).to.equal(id);
    });

    it('returns an MObject with a new id when an invalid id is provided',
      function() {
      expect(nickmoo.mobj()).to.not.be.undefined;
      expect(nickmoo.mobj(null)).to.not.be.undefined;
      expect(nickmoo.mobj(123)).to.not.be.undefined;
      expect(nickmoo.mobj(true)).to.not.be.undefined;
    });
  });
});
