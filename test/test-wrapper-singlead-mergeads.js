var assert = buster.referee.assert;
var refute = buster.referee.refute;

buster.testCase("Single wrapped ad Ads merge", {
  prepare: function(done) {
    var that = this;
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
    assert.equals(this.ad.companions.length, 5);
  },

  "prefers inline companion clickthrough by id": function() {
    for (var i = 0; i < this.ad.companions.length; i++) {
      var c = this.ad.companions[i];
      if (c.attribute('id') === 'merge') {
        assert.equals(c.getClickThrough(), "http://companion-id.inline.test.com");
      }
    }
  },

  "doesn't merge companions with same res, different id": function() {
    var found = 0;
    for (var i = 0; i < this.ad.companions.length; i++) {
      var c = this.ad.companions[i];
      if (c.attribute('id') === 'dontmerge-1') {
        assert.match(c.getAllResources(), {
          "images": { "image/jpeg": "static-dontmerge-1.jpg" }
        });
        found++;
      }
      if (c.attribute('id') === 'dontmerge-2') {
        assert.match(c.getAllResources(), {
          "images": { "image/jpeg": "static-dontmerge-2.jpg" }
        });
        found++;
      }
    }

    assert.equals(found, 2, "companions were merged");
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

  "merges companion image resources": function() {
    for (var i = 0; i < this.ad.companions.length; i++) {
      var c = this.ad.companions[i];
      if (c.attribute('id') === 'merge') {
        assert.match(c.getAllResources(), {
          "images": {
            "image/jpeg": "static-id.jpg",
            "image/png": "static-inline.png",
            "image/gif": "static-inline.gif"
          },
        });
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

  "merges ad tags": function() {
    assert.equals(this.ad.getTag('AdSystem'), "Acudeo Compatible");
    assert.equals(this.ad.getTag('AdTitle'), "VAST 2.0 Instream Test 1");
    assert.equals(this.ad.getTag('Description'), "VAST 2.0 Instream Test 1");
  },

})
