var net = require('net');
var Connection = require('./connection');

var NickMOO = function(config) {
  this.config = config;
  this.server = null; // No TCP server active atm
  this.connections = [];
}

NickMOO.NAME    = 'NickMOO';
NickMOO.VERSION = '0.0.1';

// Start listening for connectionks
NickMOO.prototype.init = function() {
  this.log(NickMOO.NAME + ' version ' + NickMOO.VERSION + ' starting...');

  this.server = net.createServer(function(sock) {
    this.log('accepted connection from ' + sock.address().address + ':' + sock.address().port);

    var connection = new Connection(this, sock);
    this.connections.push(connection); // Add this connection to the connection array
    connection.init(); // Initialize the connection
  }.bind(this));

  this.server.listen(this.config.port, function() {
    this.log('server listening on ' + this.config.port);
  }.bind(this));
}

// Safely stop the server
NickMOO.prototype.deinit = function() {

}

// Logging function
NickMOO.prototype.log = function(str) {
  console.log('[' + (new Date).toString().split(' ').splice(0, 5).join(' ') + '] ' + str);
}

module.exports = NickMOO;
