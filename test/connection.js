var expect = require('chai').expect;
var Connection = require('../lib/connection');
var FakeSock = require('./lib/fake_sock');
var FakeApp = require('./lib/fake_app');

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
      var conn = new Connection(new FakeApp(), sock);
      conn.init();
      expect(conn.timeoutInt).to.not.be.null;
      expect(conn.timeoutInt).to.not.be.undefined;
      conn.deinit();
    });

    it('sets an event handler for sock close', function() {
      var sock = new FakeSock();
      var conn = new Connection(new FakeApp(), sock);
      conn.init();
      expect(sock.evs).to.include.keys('close');
      expect(sock.evs.close).to.be.a('function');
      conn.deinit();
    });

    it('sets an event handler for sock error', function() {
      var sock = new FakeSock();
      var conn = new Connection(new FakeApp(), sock);
      conn.init();
      expect(sock.evs).to.include.keys('error');
      expect(sock.evs.error).to.be.a('function');
      conn.deinit();
    });

    it('sends a timeout check on the defined interval', function(done) {
      var sock = new FakeSock();
      var conn = new Connection(new FakeApp(), sock);
      conn.timeoutWait = 10; // Bump down the time for the test
      conn.init();
      setTimeout(function() {
        expect(sock.str).to.equal('\0');
        conn.deinit();
        done();
      }, 11);
    });
  });

  describe('#deinit', function() {
    it('removes itself from the app connections list', function() {
      var app = new FakeApp();
      var sock = new FakeSock();
      var conn = new Connection(app, sock);
      app.connections.push(conn);
      conn.init();
      conn.deinit();
      expect(app.connections).to.be.empty;
    });

    it('ends the socket', function() {
      var app = new FakeApp();
      var sock = new FakeSock();
      var conn = new Connection(app, sock);
      app.connections.push(conn);
      conn.init();
      conn.deinit();
      expect(sock.ended).to.be.true;
    });

    it('destroys the socket', function() {
      var app = new FakeApp();
      var sock = new FakeSock();
      var conn = new Connection(app, sock);
      app.connections.push(conn);
      conn.init();
      conn.deinit();
      expect(sock.destroyed).to.be.true;
    });
  });

  describe('#print', function() {
    it('prints a line to the sock', function() {
      var app = new FakeApp();
      var sock = new FakeSock();
      var conn = new Connection(app, sock);
      app.connections.push(conn);
      conn.init();
      conn.print('Hello world');
      conn.deinit();
      expect(sock.str).to.be.equal('Hello world');
    });

    it('converts LF newlines to CRLF', function() {
      var app = new FakeApp();
      var sock = new FakeSock();
      var conn = new Connection(app, sock);
      app.connections.push(conn);
      conn.init();
      conn.print('Hello\nworld\n');
      conn.deinit();
      expect(sock.str).to.be.equal('Hello\r\nworld\r\n');
    });

    it('can convert mulitple successive LF into CRLF', function() {
      var app = new FakeApp();
      var sock = new FakeSock();
      var conn = new Connection(app, sock);
      app.connections.push(conn);
      conn.init();
      conn.print('Hey\n\n\n\nthere');
      conn.deinit();
      expect(sock.str).to.be.equal('Hey\r\n\r\n\r\n\r\nthere');
    });

    it('doesn\'t modify CRLF', function() {
      var app = new FakeApp();
      var sock = new FakeSock();
      var conn = new Connection(app, sock);
      app.connections.push(conn);
      conn.init();
      conn.print('Hey\r\nthere\r\n');
      conn.deinit();
      expect(sock.str).to.be.equal('Hey\r\nthere\r\n');
    });
  });

  describe('#puts', function() {
    it('appends a newline to output', function() {
      var app = new FakeApp();
      var sock = new FakeSock();
      var conn = new Connection(app, sock);
      app.connections.push(conn);
      conn.init();
      conn.puts('Hello');
      conn.deinit();
      expect(sock.str).to.be.equal('Hello\r\n');
    });
  });

  describe('#gets', function() {
    it('can read a line of text from the sock', function(done) {
      var app = new FakeApp();
      var sock = new FakeSock();
      var conn = new Connection(app, sock);
      app.connections.push(conn);
      conn.init();
      process.nextTick(function() {
        if(sock.evs.data === undefined) conn.deinit();
        expect(sock.evs.data).to.not.be.undefined;
        sock.evs.data(new Buffer('Hello world\r\n'));
      });
      conn.gets(function(err, str) {
        expect(err).to.be.null;
        expect(str).to.equal('Hello world\r\n');
        conn.deinit();
        done();
      });
    });

    it('can read a line of text split over two packets', function(done) {
      var app = new FakeApp();
      var sock = new FakeSock();
      var conn = new Connection(app, sock);
      app.connections.push(conn);
      conn.init();
      process.nextTick(function() {
        if(sock.evs.data === undefined) conn.deinit();
        expect(sock.evs.data).to.not.be.undefined;
        sock.evs.data(new Buffer('Hello world '));
        sock.evs.data(new Buffer('over two packets\r\n'));
      });
      conn.gets(function(err, str) {
        expect(err).to.be.null;
        expect(str).to.equal('Hello world over two packets\r\n');
        conn.deinit();
        done();
      });
    });

    it('can remove itself from the data event listeners on deinit',
    function(done) {
      var app = new FakeApp();
      var sock = new FakeSock();
      var conn = new Connection(app, sock);
      app.connections.push(conn);
      conn.init();
      process.nextTick(function() {
        conn.deinit();
        expect(sock.evs.data).to.be.undefined;
        done();
      });
      conn.gets(function(err, str) {
        throw 'this should\'nt be called';
      });
    });
  });

  describe('#switchUi', function() {
    it('can set the current UI', function() {
      var app = new FakeApp();
      var sock = new FakeSock();
      var conn = new Connection(app, sock);
      var ui = {init: function(){}, deinit: function(){}};
      app.connections.push(conn);
      conn.init();

      conn.switchUi(ui);

      expect(conn.ui).to.equal(ui);
      conn.deinit();
    });

    it('can init the current UI', function(done) {
      var app = new FakeApp();
      var sock = new FakeSock();
      var conn = new Connection(app, sock);
      var ui = {init: function(){ conn.deinit(); done(); }, deinit: function(){}};
      app.connections.push(conn);
      conn.init();

      conn.switchUi(ui);
    });

    it('can deinit the current UI on connection deinit', function() {
      var app = new FakeApp();
      var sock = new FakeSock();
      var conn = new Connection(app, sock);
      var deinit = false;
      var ui = {init: function(){}, deinit: function() { deinit = true; }};
      app.connections.push(conn);
      conn.init();
      conn.switchUi(ui);
      conn.deinit();
      expect(deinit).to.be.true;
    });

    it('can deinit the current UI on switch to another UI', function() {
      var app = new FakeApp();
      var sock = new FakeSock();
      var conn = new Connection(app, sock);
      var old_deinit = false;
      var old_ui = {init: function(){}, deinit: function() { old_deinit = true; }};
      var new_ui = {init: function(){}, deinit: function() {}};
      app.connections.push(conn);
      conn.init();

      conn.switchUi(old_ui);
      conn.switchUi(new_ui);

      conn.deinit();
      expect(old_deinit).to.be.true;
      expect(conn.ui).to.equal(new_ui);
    });

    it('doesn\'t call #init on switch to a null UI (removing all UI)', function() {
      var app = new FakeApp();
      var sock = new FakeSock();
      var conn = new Connection(app, sock);
      app.connections.push(conn);
      conn.init();
      conn.switchUi(null);
      conn.deinit();
      // No assertions, attempting to call #init on null will error
    });
  });
});
