buster.testCase("Single inline ad nonlinears", {
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

  "finds nonlinears": function() {
    assert.equals(this.ad.nonlinears.length, 3);
  },

  "finds nonlinear size": function() {
    assert.equals(this.ad.nonlinears[0].attribute("width"), "300");
    assert.equals(this.ad.nonlinears[0].attribute("height"), "50");
  },

  "finds nonlinear id": function() {
    assert.match(this.ad.nonlinears[1].attribute("id"), "nlad");
  },

  "attribute selector fallback": function() {
    assert.match(this.ad.nonlinears[0].attribute("id", "def"), "def");
  },

  "finds StaticResource": function() {
    assert.match(this.ad.nonlinears[0].getAllResources(),
    {"images": {
      "image/jpeg": "nonlinear.jpg",
    }});
  },

  "finds IFrameResource": function() {
    assert.match(this.ad.nonlinears[1].getAllResources(), {"iframe": "/nonlinearframe"});
  },

  "finds HTMLResource": function() {
    assert.match(this.ad.nonlinears[2].getAllResources(), {"html": "nonlinear.html"});
  },

  "finds nonlinear #1 click through": function() {
    assert.equals(this.ad.nonlinears[0].clickThrough, "http://nonlinear1.test.com");
  },

  "finds nonlinear #2 click through": function() {
    assert.equals(this.ad.nonlinears[1].clickThrough, "http://nonlinear2.test.com");
  },

  "doesn't find non-existing nonlinear click through": function() {
    assert.isNull(this.ad.nonlinears[2].clickThrough);
  },

  "doesn't find non-existing": function() {
    var res1 = this.ad.nonlinears[0].getAllResources();
    var res2 = this.ad.nonlinears[1].getAllResources();
    var res3 = this.ad.nonlinears[2].getAllResources();

    assert.isNull(res1["html"]);
    assert.isNull(res2["html"]);

    assert.isNull(res1["iframe"]);
    assert.isNull(res3["iframe"]);

    assert.equals(res2["images"], {});
    assert.equals(res3["images"], {});
  },

})
