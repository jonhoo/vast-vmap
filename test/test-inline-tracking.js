buster.testCase("Tracking lib", {
  prepare: function(done) {
    var that = this;
    queryVAST("./test/assets/vast_inline_linear.xml", function(ads) {
      that.vast = ads;
      done();
    });
  },

  setUp: function() {
    this.ad = this.vast.getAd();
    // Reset the only value that is really modified.
    this.ad.sentImpression = false;
    this.server = sinon.fakeServer.create();
  },

  "tracks impression and creativeView on first creativeView track (linear)": function() {
    this.ad.linear.track("creativeView", 1, "");
    assert.equals(this.server.requests.length, 2);
    assert.match(this.server.requests[1], {
        method: "get",
        url: "/impression"
    });
    assert.match(this.server.requests[0], {
        method: "get",
        url: "/creativeView"
    });
  },

  "tracks impression and creativeView on first creativeView track (companion)": function() {
    this.ad.companions[0].track("creativeView", 1, "");
    assert.equals(this.server.requests.length, 2);
    assert.match(this.server.requests[1], {
        method: "get",
        url: "/impression"
    });
    assert.match(this.server.requests[0], {
        method: "get",
        url: "/firstCompanionCreativeView"
    });
  },

  "doesn't track impression on second creativeView track": function() {
    this.ad.linear.track("creativeView", 1, "");
    this.ad.linear.track("creativeView", 1, "");
    assert.equals(this.server.requests.length, 3);
    assert.match(this.server.requests[2], {
        method: "get",
        url: "/creativeView"
    });
  },

  "tracks companion creativeView": function() {
    this.ad.companions[0].track("creativeView", 1, "");
    // 2 because of the impression tracking
    assert.equals(this.server.requests.length, 2);
    assert.match(this.server.requests[0], {
        method: "get",
        url: "/firstCompanionCreativeView"
    });
  },

  "tracks linear click": function() {
    this.ad.linear.track("click", 1, "");
    assert.equals(this.server.requests.length, 1);
    assert.match(this.server.requests[0], {
        method: "get",
        url: "/click"
    });
  },

  "tracks linear events": function() {
    var evs = ['start', 'midpoint', 'firstQuartile', 'thirdQuartile', 'complete'];
    for (var i = 0; i < evs.length; i++) {
      this.ad.linear.track(evs[i], 1, "");
      assert.equals(this.server.requests.length, i+1);
      assert.match(this.server.requests[i], {
          method: "get",
          url: "/" + evs[i]
      });
    }
  },

})
