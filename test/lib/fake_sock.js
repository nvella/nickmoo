function FakeSock() {this.evs = {};}
FakeSock.prototype.address = function() {return{address:'127.0.0.1',port:54321};};
FakeSock.prototype.write   = function(str) {this.str = str;};
FakeSock.prototype.on      = function(ev, func) {this.evs[ev] = func;};
FakeSock.prototype.end     = function() {this.ended = true;};
FakeSock.prototype.destroy = function() {this.destroyed = true;};

module.exports = FakeSock;
