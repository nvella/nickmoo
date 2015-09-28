var Connection = function(app, sock) {
  this._app = app;
  this.sock = sock;
  this.ip   = sock.address().address;
  this.port = sock.address().port;
  this.timeoutInt = null; // Connection timeout checking interval
  this.timeoutWait = 30000; // Check for timeout every 30 seconds
  this.getsCleanup = null;
}

Connection.prototype.init = function() {
  // Set the connection timeout interval
  // This periodically sends a non-printable character, which will cause an
  // error if the connection is dropped
  this.timeoutInt = setInterval(function() {
    this.sock.write("\0");
  }.bind(this), this.timeoutWait);

  this.sock.on('close', this.deinit.bind(this));
  this.sock.on('error', this.deinit.bind(this))

  this.sock.write(this._app.messages.welcome);
}

Connection.prototype.deinit = function() {
  this._app.log('connection ' + this.ip + ':' + this.port + ' deinit');
  // TODO deinit any menus, the mobject, etc
  // Remove ourselves from the app's connection list
  var i = this._app.connections.indexOf(this);
  if(i >= 0) this._app.connections.splice(i, 1);
  // Clean up
  if(this.getsCleanup !== null) this.getsCleanup(); // Cleanup our gets op
  clearInterval(this.timeoutInt);
  this.sock.end();     // End the socket
  this.sock.destroy(); // Destroy the socket, ensuring no more activity can
                       // occur
}

Connection.prototype.print = function(str) {
  var i = str.indexOf('\n');
  while(i >= 0) {
    if(str[i - 1] !== '\r') {
      var before = str.slice(0, i);
      var after = str.slice(i + 1, str.length);
      str = before + '\r\n' + after;
    }
    i = str.indexOf('\n', i + 1);
  }
  this.sock.write(str);
}

Connection.prototype.puts = function(str) {
  this.print(str + '\n');
}

Connection.prototype.gets = function(callback) {
  var buffer = '';

  // Set up the data listener
  var dataListener = function(data) {
    if(data.indexOf(10) >= 0) {
      // New line present
      buffer += data.slice(0, data.indexOf(10)).toString();
      done();
    } else {
      buffer += data.toString();
    }
  }.bind(this);

  var cleanup = function() {
    this.sock.removeListener('data', dataListener);
  }.bind(this);

  var done = function() {
    cleanup();
    callback(null, buffer + "\n");
  }.bind(this);

  this.sock.on('data', dataListener);
  this.getsCleanup = cleanup;
}

module.exports = Connection;
