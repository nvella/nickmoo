var expect = require('chai').expect;
var Connection = require('../lib/connection');

function FakeSock() {this.evs = {};}
FakeSock.prototype.address = function() {return{address:'127.0.0.1',port:54321};};
FakeSock.prototype.write   = function(str) {this.str = str;};
FakeSock.prototype.on      = function(ev, func) {this.evs[ev] = func;};
FakeSock.prototype.end     = function() {};
FakeSock.prototype.destroy = function() {};

function App() {this.connections = []; this.messages = {welcome:''};}
App.prototype.log = function() {};

describe('Connection', function() {
  describe('constructor', function() {
    it('should have this.ip and this.port equal to sock.address()', function() {
      var sock = new FakeSock();
      var conn = new Connection(null, sock);
      expect(conn.ip).to.equal('127.0.0.1');
      expect(conn.port).to.equal(54321);
    });
  });

  describe('#init', function() {
    it('sets a timeout to check if the connection is alive', function() {
      var sock = new FakeSock();
      var conn = new Connection(new App(), sock);
      conn.init();
      expect(conn.timeoutInt).to.not.be.null;
      expect(conn.timeoutInt).to.not.be.undefined;
      conn.deinit();
    });

    it('sets an event handler for sock close', function() {
      var sock = new FakeSock();
      var conn = new Connection(new App(), sock);
      conn.init();
      expect(sock.evs).to.include.keys('close');
      expect(sock.evs.close).to.be.a('function');
      conn.deinit();
    });

    it('sets an event handler for sock error', function() {
      var sock = new FakeSock();
      var conn = new Connection(new App(), sock);
      conn.init();
      expect(sock.evs).to.include.keys('error');
      expect(sock.evs.error).to.be.a('function');
      conn.deinit();
    });
  });
});
