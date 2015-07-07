var assert = buster.referee.assert;
var refute = buster.referee.refute;

buster.testCase("Empty VAST", {
  setUp: function(done) {
    var that = this;
    this.numErrors = 0;

    queryVAST("./test/assets/vast_empty.xml", function(ads) {
      that.vast = ads;
      done();
    }, function() {
      that.numErrors++;
      done();
    });
  },

  "called onError once": function() {
    assert.equals(this.numErrors, 1);
  },

})
