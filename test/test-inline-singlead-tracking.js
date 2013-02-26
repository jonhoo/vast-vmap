buster.testCase("Single inline ad tracking", {
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
    this.server = this.sandbox.useFakeServer();
  },

  tearDown: function() {
    this.server.restore();
    delete this.server;
  },

  "tracks impression and creativeView on first creativeView track (linear)": function() {
    this.ad.linear.track("creativeView", 1, "");
    assert.equals(this.server.requests.length, 2);
    assert.match(this.server.requests[1], {
        method: "GET",
        url: "/impression"
    });
    assert.match(this.server.requests[0], {
        method: "GET",
        url: "/creativeView"
    });
  },

  "tracks impression and creativeView on first creativeView track (companion)": function() {
    this.ad.companions[0].track("creativeView", 1, "");
    assert.equals(this.server.requests.length, 2);
    assert.match(this.server.requests[1], {
        method: "GET",
        url: "/impression"
    });
    assert.match(this.server.requests[0], {
        method: "GET",
        url: "/firstCompanionCreativeView"
    });
  },

  "tracks impression and creativeView on first creativeView track (nonlinear)": function() {
    this.ad.nonlinears[0].track("creativeView", 1, "");
    assert.equals(this.server.requests.length, 2);
    assert.match(this.server.requests[1], {
        method: "GET",
        url: "/impression"
    });
    assert.match(this.server.requests[0], {
        method: "GET",
        url: "/nlcreativeView"
    });
  },

  "doesn't track impression on second creativeView track": function() {
    this.ad.linear.track("creativeView", 1, "");
    this.ad.linear.track("creativeView", 1, "");
    assert.equals(this.server.requests.length, 3);
    assert.match(this.server.requests[2], {
        method: "GET",
        url: "/creativeView"
    });
  },

  "tracks companion creativeView": function() {
    this.ad.companions[0].track("creativeView", 1, "");
    // 2 because of the impression tracking
    assert.equals(this.server.requests.length, 2);
    assert.match(this.server.requests[0], {
        method: "GET",
        url: "/firstCompanionCreativeView"
    });
  },

  "tracks nonlinear creativeView": function() {
    this.ad.nonlinears[0].track("creativeView", 1, "");
    // 2 because of the impression tracking
    assert.equals(this.server.requests.length, 2);
    assert.match(this.server.requests[0], {
        method: "GET",
        url: "/nlcreativeView"
    });
  },

  "tracks nonlinear creativeView for all nonlinears": function() {
    this.ad.nonlinears[1].track("creativeView", 1, "");
    // 2 because of the impression tracking
    assert.equals(this.server.requests.length, 2);
    assert.match(this.server.requests[0], {
        method: "GET",
        url: "/nlcreativeView"
    });
  },

  "tracks linear click": function() {
    this.ad.linear.track("click", 1, "");
    assert.equals(this.server.requests.length, 1);
    assert.match(this.server.requests[0], {
        method: "GET",
        url: "/click"
    });
  },

  "tracks linear events": function() {
    var evs = ['start', 'midpoint', 'firstQuartile', 'thirdQuartile', 'complete'];
    for (var i = 0; i < evs.length; i++) {
      this.ad.linear.track(evs[i], 1, "");
      assert.equals(this.server.requests.length, i+1);
      assert.match(this.server.requests[i], {
          method: "GET",
          url: "/" + evs[i]
      });
    }
  },

  "parses absolute progress offset": function() {
    assert.containsMatch(this.ad.linear.getTrackingPoints(), {
      "offset": 3661
    });
  },

  "parses percentage progress offset": function() {
    assert.containsMatch(this.ad.linear.getTrackingPoints(), {
      "offset": "10%"
    });
  },

  "gets tracking points from non-progress events": function() {
    var match = {
      "start": "start",
      "firstQuartile": "25%",
      "midpoint": "50%",
      "thirdQuartile": "75%",
      "end": "end"
    };

    for (var ev in match) {
      assert.containsMatch(this.ad.linear.getTrackingPoints(), {
        "event": ev,
        "offset": match[ev]
      });
    }
  },

})
