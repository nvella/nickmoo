var expect = require('chai').expect;
var MObject = require('../lib/mobject');
var ObjectId = require('mongodb').ObjectId;

describe('MObject', function() {
  describe('new', function() {
    it('creates a new object id for itself when one isn\'t provided',
      function() {
      var mobj = new MObject();
      expect(mobj.id).to.be.an.instanceof(ObjectId);
    });

    it('sets the creation time to within a second of the object being created',
      function() {
      var mobj = new MObject();
      var now = new Date() / 1000;
      expect(mobj.created).to.be.gte(now - 1);
      expect(mobj.created).to.be.lte(now + 1);
    });
  });
});
