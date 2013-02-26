buster.testCase("Single wrapped ad Ads merge", {
  prepare: function(done) {
    var that = this;
    this.timeout = 500;
    queryVAST("./test/assets/vast_wrapper_merge.xml", function(ads) {
      that.vast = ads;
      done();
    });
  },

  setUp: function() {
    this.ad = this.vast.getAd();
    this.ad.sentImpression = false;
  },

  "merges companions correctly": function() {
    assert.equals(this.ad.companions.length, 4);
  },

  "prefers inline companion clickthrough by id": function() {
    for (var i = 0; i < this.ad.companions.length; i++) {
      var c = this.ad.companions[i];
      if (c.attribute('id') === 'merge') {
        assert.equals(c.getClickThrough(), "http://companion-id.inline.test.com");
      }
    }
  },

  "merges companion resources by id": function() {
    for (var i = 0; i < this.ad.companions.length; i++) {
      var c = this.ad.companions[i];
      if (c.attribute('id') === 'merge') {
        assert.match(c.getAllResources(), {
          "images": { "image/jpeg": "static-id.jpg" },
          "iframe": "/inline-id"
        });
      }
    }
  },

  "prefers inline companion clickthrough by size": function() {
    for (var i = 0; i < this.ad.companions.length; i++) {
      var c = this.ad.companions[i];
      if (c.attribute('width', true) === c.attribute('height', false)) {
        assert.equals(c.getClickThrough(), "http://companion-size.inline.test.com");
      }
    }
  },

  "merges companion resources by size": function() {
    for (var i = 0; i < this.ad.companions.length; i++) {
      var c = this.ad.companions[i];
      if (c.attribute('width', true) === c.attribute('height', false)) {
        assert.match(c.getAllResources(), {
          "images": { "image/jpeg": "static-size.jpg" },
          "iframe": "/inline-size"
        });
      }
    }
  },

})
