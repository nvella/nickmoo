var Connection = function(app, sock) {
  this._app = app;
  this.sock = sock;
  this.ip   = sock.address().address;
  this.port = sock.address().port;
  this.timeoutInt = null; // Connection timeout checking interval
}

Connection.prototype.init = function() {
  // Set the connection timeout interval
  // This periodically sends a non-printable character, which will cause an
  // error if the connection is dropped
  this.timeoutInt = setInterval(function() {
    this.sock.write("\0");
  }.bind(this), 30000); // Every 30 seconds

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
  clearInterval(this.timeoutInt);
  this.sock.end();     // End the socket
  this.sock.destroy(); // Destroy the socket, ensuring no more activity can
                       // occur
}

module.exports = Connection;
