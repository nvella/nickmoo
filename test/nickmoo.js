var net = require('net');
var expect = require('chai').expect;
var NickMOO = require('../lib/nickmoo');
var async = require('async');

describe('NickMOO', function() {
  var config = {
    port: 54321,
    dbUri: "mongodb://127.0.0.1:27017/nickmoo",
    serverName: "NickMOO Development"
  };

  this.timeout(5000);

  describe('#init', function() {
    it('can initialize the MOO server', function(done) {
      var nickmoo = new NickMOO(config);
      nickmoo.init(function() {
        nickmoo.deinit(function() {
          done();
        });
      });
    });

    it('can accept a connection', function(done) {
      var nickmoo = new NickMOO(config);
      var messages = [];
      nickmoo.log = function(str) {
        messages.push(str);
        console.log('NickMOO#init accept connection: ' + str);
      };
      nickmoo.init(function() {
        var client = net.connect({port: config.port}, function() {
          async.series([
            function(cb) { setTimeout(cb, 10); },
            function(cb) { expect(nickmoo.connections).to.not.be.empty; cb(); },
            function(cb) { client.end(cb); },
            function(cb) { nickmoo.deinit(cb); },
            function(cb) { setTimeout(cb, 10); },
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
      var nickmoo = new NickMOO(config);
      var messages = [];
      nickmoo.log = function(str) {
        messages.push(str);
        console.log('NickMOO#deinit close all connections: ' + str);
      };

      nickmoo.init(function() {
        var client = net.connect({port: config.port}, function() {
          async.series([
            function(cb) { setTimeout(cb, 10); },
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
      var nickmoo = new NickMOO(config);
      var messages = [];
      nickmoo.log = function(str) {
        messages.push(str);
        console.log('NickMOO#deinit blocks new tcp clients: ' + str);
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
      var nickmoo = new NickMOO(config);
      var messages = [];
      nickmoo.log = function(str) {
        messages.push(str);
        console.log('NickMOO#deinit close db connection: ' + str);
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
});
