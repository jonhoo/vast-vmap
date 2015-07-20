var assert = buster.referee.assert;
var refute = buster.referee.refute;

buster.testCase("Single wrapped ad tracking", {
  prepare: function(done) {
    var that = this;
    queryVAST("./test/assets/vast_wrapper_linear_1.xml", function(ads) {
      that.vast = ads;
      done();
    });
  },

  setUp: function() {
    this.ad = this.vast.getAd();
    // Reset the only value that is really modified.
    var ad = this.ad;
    while (ad !== null) {
      ad.sentImpression = false;
      ad = ad.parentAd;
    }
    this.server = this.useFakeServer();
  },

  tearDown: function() {
    this.server.restore();
    delete this.server;
  },

  "tracks wrapped ad inline impression on first linear creativeView": function() {
    this.ad.linear.track("creativeView", 1, "");
    // 4 = 2*creativeView + 2*impression
    assert.equals(this.server.requests.length, 4);
    assert.containsMatch(this.server.requests, {
        url: "/impression"
    });
    assert.containsMatch(this.server.requests, {
        url: "/creativeView"
    });
    assert.containsMatch(this.server.requests, {
        url: "/wrapper/impression"
    });
  },

  "doesn't track impression again on second creativeView": function() {
    this.ad.linear.track("creativeView", 1, "");
    this.ad.linear.track("creativeView", 1, "");
    // 6 = 2*creativeView + 2*2*impression
    assert.equals(this.server.requests.length, 6);
  },

  "tracks wrapped linear creativeView": function() {
    this.ad.linear.track("creativeView", 1, "");
    // +2 because of the impression tracking
    assert.equals(this.server.requests.length, 4);
    assert.containsMatch(this.server.requests, {
        url: "/creativeView"
    });
    assert.containsMatch(this.server.requests, {
        url: "/wrapper/creativeView"
    });
  },

  "tracks wrapped nonlinear creativeView": function() {
    this.ad.nonlinears[0].track("creativeView", 1, "");
    // +2 because of the impression tracking
    assert.equals(this.server.requests.length, 4);
    assert.containsMatch(this.server.requests, {
        url: "/nlcreativeView"
    });
    assert.containsMatch(this.server.requests, {
        url: "/wrapper/nlcreativeView"
    });
  },


  "tracks wrapped linear click": function() {
    this.ad.linear.track("click", 1, "");
    assert.equals(this.server.requests.length, 2);
    assert.containsMatch(this.server.requests, {
        url: "/click"
    });
    assert.containsMatch(this.server.requests, {
        url: "/wrapper/click"
    });
  },

  "tracks wrapped linear events": function() {
    var evs = ['start', 'midpoint', 'firstQuartile', 'thirdQuartile', 'complete'];
    for (var i = 0; i < evs.length; i++) {
      this.ad.linear.track(evs[i], 1, "");
      assert.equals(this.server.requests.length, 2*i+2);
    }
    for (var i = 0; i < evs.length; i++) {
      assert.containsMatch(this.server.requests, {
          url: "/" + evs[i]
      });
      assert.containsMatch(this.server.requests, {
          url: "/wrapper/" + evs[i]
      });
    }
  },

  "parses wrapped absolute progress offset": function() {
    assert.containsMatch(this.ad.linear.getTrackingPoints(), {
      "offset": 2*3600 + 2*60 + 2*1
    });
  },

  "parses wrapped percentage progress offset": function() {
    assert.containsMatch(this.ad.linear.getTrackingPoints(), {
      "percentOffset": "20%"
    });
  },

})
