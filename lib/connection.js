var Connection = function(app, sock) {
  this._app = app;
  this.sock = sock;
}

Connection.prototype.init = function() {
  this.sock.write(this._app.messages.welcome);
}

Connection.prototype.deinit = function() {

}

module.exports = Connection;
