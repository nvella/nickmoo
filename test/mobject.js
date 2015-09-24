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
  });
});
