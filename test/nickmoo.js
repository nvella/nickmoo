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

  describe('#init', function() {
    this.timeout(5000);

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
        console.log('accept connection: ' + str);
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
});
