buster.testCase("Empty wrappers", {
  errorCounter: 0,

  prepare: function(done) {
    var that = this;
    queryVAST("./test/assets/vast_wrapper_no_ads.xml", function(ads) {
      that.vast = ads;
      done();
    }, function() {
      that.errorCounter++;
    });
  },

  setUp: function() {
    this.ad = this.vast.getAd();
    this.ad.sentImpression = false;
  },

  "called onError once": function() {
    assert.equals(this.errorCounter, 1);
  },

})
