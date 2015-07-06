var assert = buster.referee.assert;
var refute = buster.referee.refute;

buster.testCase("Single inline ad media files", {
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
    this.medias = this.ad.linear.getAllMedias();
  },

  "finds linear media files and attributes": function() {
    assert.equals(this.medias.length, 4);
    assert.match(this.medias[0], {
      "delivery": "progressive",
      "type": "video/x-flv",
      "bitrate": "500",
      "width": "400",
      "height": "300",
      "scalable": "true",
      "maintainAspectRatio": "true"
    });
    assert.equals(this.medias[0]["src"], "http://test.com/video.flv");
  },

  "finds highest bitrate using exact resolution": function() {
    assert.equals(this.ad.linear.getBestMedia({width: 800, height: 600}), this.medias[3]);
  },

  "finds best media using exact resolution and bitrate": function() {
    assert.equals(this.ad.linear.getBestMedia({ width: 800, height: 600, bitrate: 500 }), this.medias[2]);
  },

  "finds best media using close resolution": function() {
    assert.equals(this.ad.linear.getBestMedia({ width: 700, height: 500 }), this.medias[3]);
  },

  "finds best media using close resolution and bitrate": function() {
    assert.equals(this.ad.linear.getBestMedia({ width: 700, height: 500, bitrate: 501 }), this.medias[2]);
  },

})
