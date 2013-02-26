buster.testCase("Single Inline Ad", {
  prepare: function(done) {
    var that = this;
    queryVAST("./test/assets/vast_inline_linear.xml", function(ads) {
      that.vast = ads;
      done();
    });
  },

  setUp: function() {
    this.ad = this.vast.getAd();
    this.ad.sentImpression = false;
  },

  "has ad": function() {
    refute.isNull(this.ad);
  },

  "finds linear": function() {
    refute.isNull(this.ad.linear);
  },

  "finds linear click through": function() {
    assert.equals(this.ad.linear.clickThrough, "http://linear.test.com");
  },

  "finds companion #1 click through": function() {
    assert.equals(this.ad.companions[0].clickThrough, "http://companion1.test.com");
  },

  "finds companion #2 click through": function() {
    assert.equals(this.ad.companions[1].clickThrough, "http://companion2.test.com");
  },

  "finds companions": function() {
    assert.equals(this.ad.companions.length, 2);
  },

})
