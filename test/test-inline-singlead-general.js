buster.testCase("Single inline ad", {
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

  "finds linear duration": function() {
    assert.equals(this.ad.linear.getDuration(), 3661);
  },

  "finds linear skipoffset": function() {
    assert.equals(this.ad.linear.attribute('skipoffset'), 2*3600+2*60+2);
  },

  "finds ad tags": function() {
    assert.equals(this.ad.getTag('AdSystem'), "Acudeo Compatible");
    assert.equals(this.ad.getTag('AdTitle'), "VAST 2.0 Instream Test 1");
    assert.equals(this.ad.getTag('Description'), "VAST 2.0 Instream Test 1");
  },

})
