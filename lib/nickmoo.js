var net = require('net');
var fs = require('fs');
var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectId;
var async = require('async');

var Connection = require('./connection');
var MObject = require('./mobject');

var NickMOO = function(config) {
  this.config = config;

  this.server = null; // No TCP server active atm
  this.db = null; // DB not connected yet
  this.collections = {};
  this.connections = [];
  this.rootObj = null;
}

NickMOO.NAME    = 'NickMOO';
NickMOO.VERSION = '0.0.1';

// Start listening for connectionks
NickMOO.prototype.init = function(callback) {
  this.log(NickMOO.NAME + ' version ' + NickMOO.VERSION + ' starting...');

  // Use async to make sure the DB is connected and initialized first before
  // the TCP server starts accepting
  async.series([
    // Connect to the database and collections
    function(callback) { this.initDb(callback); }.bind(this),
    // Check if the database has been set-up
    function(callback) {
      this.log('checking database...');
      this.collections.config.findOne({}, function(err, doc) {
        if(doc === null) {
          this.log('Error: The database has not been set-up for NickMOO yet.');
          this.log('Please run the `db-init\' script found in the \'util/\' directory.');
          this.deinitDb(callback.bind(this, new Error('db not set up')));
        } else {
          this.rootObj = this.mobj(doc.rootId);
          this.log('world config loaded');
          callback();
        }
      }.bind(this));
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
    }.bind(this)
  ], function() { if(callback) callback(); });
}

// Safely stop the server
NickMOO.prototype.deinit = function(callback) {
  this.log('server shutting down...');
  async.series([
    function(cb) { // Deinit all the connections
      async.each(this.connections, function(conn, cb) {
        conn.deinit();
        cb();
      }, cb);
    }.bind(this),
    function(cb) { this.server.close(cb); }.bind(this),
    function(cb) { this.deinitDb(cb); }.bind(this)
  ], callback);
}

// Connect to the DB
NickMOO.prototype.initDb = function(callback) {
  async.series([
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

    // Connect to the config collection
    function(callback) {
      this.log('connecting to config collection...');
      this.db.collection('config', function(err, collection) {
        if(err) throw err;
        this.collections.config = collection;
        this.log('config collection connection successful');
        callback();
      }.bind(this))
    }.bind(this)
  ], callback);
}

// Disconnect from the Db
NickMOO.prototype.deinitDb = function(callback) {
  this.db.close(false, callback);
}

// Easy MObject creation
NickMOO.prototype.mobj = function(id) {
  switch (typeof(id)) {
    case 'string':
      return new MObject(this, new ObjectId(id));
    case 'object':
      if(id instanceof ObjectId) return new MObject(this, id);
      // Otherwise, fall through to default
    default:
      return new MObject(this); // Just return a new mobject
  }
}

// Logging function
NickMOO.prototype.log = function(str) {
  console.log('[' + (new Date).toString().split(' ').splice(0, 5).join(' ') + '] ' + str);
}

module.exports = NickMOO;
