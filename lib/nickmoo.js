var net = require('net');
var fs = require('fs');
var MongoClient = require('mongodb').MongoClient;
var async = require('async');

var Connection = require('./connection');
var MObject = require('./mobject');

var NickMOO = function(config) {
  this.config = config;
  this.messages = {}; // Static messages that are displayed to the user

  this.server = null; // No TCP server active atm
  this.db = null; // DB not connected yet
  this.collections = {};
  this.connections = [];
}

NickMOO.NAME    = 'NickMOO';
NickMOO.VERSION = '0.0.1';

// Start listening for connectionks
NickMOO.prototype.init = function(callback) {
  this.log(NickMOO.NAME + ' version ' + NickMOO.VERSION + ' starting...');

  // Use async to make sure the DB is connected and initialized first before
  // the TCP server starts accepting
  async.series([
    // Load messages
    function(callback) {
      this.log('loading messages...');
      fs.readdir('messages', function(err, files) {
        if(err) throw err;
        async.each(files, function(file, callback) {
          this.log('  ' + file);
          fs.readFile('messages/' + file, function(err, data) {
            if(err) { this.log('  failed to read ' + file); return callback(); }
            this.messages[file] = data.toString().
              replace(/{\NAME\}/g, NickMOO.NAME).
              replace(/{\VERSION\}/g, NickMOO.VERSION).
              replace(/{\SERVER_NAME\}/g, this.config.serverName);
            callback();
          }.bind(this));
        }.bind(this), callback);
      }.bind(this));
    }.bind(this),

    // Connect to database
    function(callback) {
      // Attempt to connect to the database
      this.log('connecting to database...');
      MongoClient.connect(this.config.dbUri, function(err, db) {
        if(err) throw err;
        this.db = db;
        this.log('DB connection successful');
        callback();
      }.bind(this));
    }.bind(this),

    // Connect to the object collection
    function(callback) {
      this.log('connecting to objects collection...');
      this.db.collection('objects', function(err, collection) {
        if(err) throw err;
        this.collections.objects = collection;
        this.log('objects collection connection successful');
        callback();
      }.bind(this))
    }.bind(this),

    // Set up socket and listen
    function(callback) {
      this.server = net.createServer(function(sock) {
        this.log('accepted connection from ' + sock.address().address + ':' + sock.address().port);

        var connection = new Connection(this, sock);
        this.connections.push(connection); // Add this connection to the connection array
        connection.init(); // Initialize the connection
      }.bind(this));

      this.server.listen(this.config.port, function() {
        this.log('server listening on ' + this.config.port);
      }.bind(this));

      callback();
    }.bind(this),

    function() { if(callback) callback(); }
  ]);
}

// Safely stop the server
NickMOO.prototype.deinit = function() {
  // TODO
}

// Easy MObject creation
NickMOO.prototype.mobj = function(id, callback) {
  var mobj = new MObject(this, id);
  mobj.load(callback);
}

// Logging function
NickMOO.prototype.log = function(str) {
  console.log('[' + (new Date).toString().split(' ').splice(0, 5).join(' ') + '] ' + str);
}

module.exports = NickMOO;
