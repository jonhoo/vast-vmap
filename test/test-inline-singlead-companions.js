buster.testCase("Single inline ad companions", {
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

  "finds companions": function() {
    assert.equals(this.ad.companions.length, 3);
  },

  "finds companion size": function() {
    assert.equals(this.ad.companions[0].attribute("width"), "300");
    assert.equals(this.ad.companions[0].attribute("height"), "250");
  },

  "finds companion id": function() {
    assert.match(this.ad.companions[2].attribute("id"), "ad");
  },

  "attribute selector fallback": function() {
    assert.match(this.ad.companions[0].attribute("id", "def"), "def");
  },

  "finds StaticResource": function() {
    assert.match(this.ad.companions[0].getAllResources(),
    {"images": {
      "image/jpeg": "static.jpg",
      "image/png": "static.png"
    }});
  },

  "finds IFrameResource": function() {
    assert.match(this.ad.companions[1].getAllResources(), {"iframe": "/frame"});
  },

  "finds HTMLResource": function() {
    assert.match(this.ad.companions[2].getAllResources(), {"html": "page.html"});
  },

  "finds companion #1 click through": function() {
    assert.equals(this.ad.companions[0].clickThrough, "http://companion1.test.com");
  },

  "finds companion #2 click through": function() {
    assert.equals(this.ad.companions[1].clickThrough, "http://companion2.test.com");
  },

  "doesn't find non-existing companion click through": function() {
    assert.isNull(this.ad.companions[2].clickThrough);
  },

  "doesn't find non-existing": function() {
    var res1 = this.ad.companions[0].getAllResources();
    var res2 = this.ad.companions[1].getAllResources();
    var res3 = this.ad.companions[2].getAllResources();

    assert.isNull(res1["html"]);
    assert.isNull(res2["html"]);

    assert.isNull(res1["iframe"]);
    assert.isNull(res3["iframe"]);

    assert.equals(res2["images"], {});
    assert.equals(res3["images"], {});
  },

})
