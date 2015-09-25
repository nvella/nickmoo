var expect = require('chai').expect;
var Connection = require('../lib/connection');
var FakeSock = require('./lib/fake_sock');

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

  describe('#deinit', function() {
    it('removes itself from the app connections list', function() {
      var app = new App();
      var sock = new FakeSock();
      var conn = new Connection(app, sock);
      app.connections.push(conn);
      conn.init();
      conn.deinit();
      expect(app.connections).to.be.empty;
    });

    it('ends the socket', function() {
      var app = new App();
      var sock = new FakeSock();
      var conn = new Connection(app, sock);
      app.connections.push(conn);
      conn.init();
      conn.deinit();
      expect(sock.ended).to.be.true;
    });

    it('destroys the socket', function() {
      var app = new App();
      var sock = new FakeSock();
      var conn = new Connection(app, sock);
      app.connections.push(conn);
      conn.init();
      conn.deinit();
      expect(sock.destroyed).to.be.true;
    });
  });
});
