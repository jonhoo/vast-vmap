/**
 * @const
 */
var VMAPNS = "http://www.iab.net/vmap-1.0";

/**
 * Asynchronously fetches the given URL, parses the returned content as XML and
 * passes the resulting DOMDocument to onSuccess. If an error occurs, onFailure
 * is called with details of the error as parameters.
 *
 * @param {string} url URL to fetch
 * @param {*} identifier Will be passed to the onSuccess and onFailure callbacks
 * @param {function(Document, *)} onSuccess Callback for success
 * @param {function()} onFailure Callback for failure. First parameter is the
 *   cause of the error, which is either an exception, or the XmlHttpRequest
 *   object if the response was not parsed as XML. The second parameter is the
 *   identifier.
 */
var fetchXML = function(url, identifier, onSuccess, onFailure) {
  var request = new XMLHttpRequest();
  request.onreadystatechange = function() {
    if (request.readyState === 4) {
      if (request.status === 200) {
        if (request.responseXML !== null) {
          onSuccess(request.responseXML, identifier);
        } else {
          onFailure(request, identifier);
        }
      } else {
        onFailure(request, identifier);
      }
    }
  };

  request.open("get", url, true);
  request.send();
}

/**
 * Extracts tracking events from the given XML fragment
 *
 * @constructor
 * @param {Element} root XML node that contains <TrackingEvents>
 * @param {VASTAd} [ad] The ad holding whatever element has Tracking Events.
 *   This is provided so that "creativeView" will also automatically track to an
 *   ad impression.
 */
function TrackingEvents(root, ad) {
  this.events = {};
  this.ad = ad;

  if (root.tagName !== "TrackingEvents") {
    root = root.getElementsByTagName("TrackingEvents");
    if (root.length !== 1) {
      return;
    }

    root = root.item(0);
  }

  var tracks = root.getElementsByTagName("Tracking");
  for (var i = 0; i < tracks.length; i++) {
    var e = tracks[i].getAttribute("event");
    if (!e) {
      continue;
    }

    offset = null;
    if (e === "progress") {
      offset = tracks[i].getAttribute("offset");
      e += "-" + offset;
    }

    this.events[e] = this.events[e] || [];

    var ev = {
      "url": tracks[i].textContent.replace(/\s/g, ""),
      "offset": offset,
      "event": e
    };

    this.events[e].push(ev);
  }
}

/**
 * Sends a GET request to the given URL
 *
 * @param {string} url The URL to request
 */
TrackingEvents.prototype.finger = function(url) {
  var request = new XMLHttpRequest();
  request.open("get", url, true);
  request.send();
}

/**
 * Adds the tracking events found in the given TrackingEvents object to this one
 *
 * @param {TrackingEvents} other TrackingEvents object to merge in
 */
TrackingEvents.prototype.augment = function(other) {
  other.events.forEach(function(evs, e) {
    if (!this.events[e]) {
      this.events[e] = evs;
    } else {
      this.events[e] = this.events[e].concat(evs);
    }
  });
};

/**
 * Adds a click tracking URI, since those are often not specified in a
 * <TrackingEvents> wrapper for some reason
 *
 * @param {string} url Tracking URL for clicks
 */
TrackingEvents.prototype.addClickTracking = function(url) {
  var ev = {
    "url": url,
    "event": "click",
    "offset": null
  };

  if (!this.events["click"]) {
    this.events["click"] = [ev];
  } else {
    this.events["click"].push(ev);
  }
};

/**
 * Returns all events of the given types
 *
 * @param {string[]} evs Event types to look for
 * @return {object[]} A list of objects each representing one tracked event.
 *   Every object contains an "event" index holding the event name and
 *   optionally an "attributes" index holding a key-value mapping of any
 *   additional attributes for the event (like "offset" for progress events).
 */
TrackingEvents.prototype.getEventsOfTypes = function(evts) {
  var ret = [];
  var includeProgress = evts.indexOf('progress') > -1;

  for (var e in this.events) {
    if (!this.events.hasOwnProperty(e)) {
      continue;
    }

    if (evts.indexOf(e) > -1 || (includeProgress && e.indexOf("progress-") === 0)) {
      ret = ret.concat(this.events[e]);
    }
  };

  return ret;
};

/**
 * Notifies all URIs that have subscribed to the given event type.
 *
 * @param {string} ev Event type to notify
 * @param {object} macros Macros to replace in the tracking URIs
 */
TrackingEvents.prototype.track = function(ev, macros) {
  var evs = [].concat(this.events[ev]);
  if (!evs) {
    return;
  }

  for (var m in macros) {
    if (!macros.hasOwnProperty(m)) {
      continue;
    }

    macros["[" + m + "]"] = encodeURIComponent(macros[m]);
    delete macros[m];
  };

  // First creative view for a creative within an ad should count as an
  // impression
  if (ev === "creativeView") {
    var ad = this.ad;
    while (ad !== null && !ad.hasSentImpression()) {
      ad.impressionSent();
      for (var i = 0; i < ad.impressions.length; i++) {
        evs.push({"url": ad.impressions[i]});
      }
      ad = ad.parentAd;
    }
  }

  var that = this;
  evs.forEach(function(e) {
    var url = e["url"];

    // Standard dictates 8 digits of randomness
    macros["[CACHEBUSTING]"] = parseInt(Math.random() * 99999999, 10);

    for (var m in macros) {
      if (!macros.hasOwnProperty(m)) {
        continue;
      }
      url = url.replace(m, macros[m]);
    };

    that.finger(url);
  });
};

/**
 * Query the server for the available Ad Breaks and pass them to the callback
 *
 * This function will also asynchronously parse (and fetch if necessary) the
 * VAST ad specifications for each break in the VMAP response.
 *
 * @constructor
 * @param {string} server The server URL to contact to retrieve the VMAP
 * @param {function} breakHandler The function to call when Ad Breaks have been
 *   fetched. This function will receive a list of break positions. Each
 *   position can either be a percentage (<1), a number of seconds into the
 *   content video or one of the string literals "start" or "end". Ordinal
 *   positions are not supported and thus will not be passed.
 * @param {function(number, VASTAds)} adHandler The function to call whenever
 *   the VAST ad response for an ad break has been fetched and/or parsed. This
 *   function will be called at most once for every ad break given to
 *   breakHandler. The first parameter to the function is the corresponding
 *   index in the list passed to the breakHandler, and the second parameter is
 *   the VASTAds object holding the possible ads to play for that break.
 */
function VMAP(server, breakHandler, adHandler) {
  /**
   * List of objects representing an ad break.
   * Each object has the following indices:
   *   - ad: The VASTAds object
   *   - breakId: The ad server's break ID
   *   - tracking: The tracking settins
   *   - position: The position given as a percentage (suffix %), an absolute
   *       number of seconds or "start"/"end"
   */
  this.breaks = [];

  var that = this;

  fetchXML(server, null, function(doc) {
    var adbreaks = doc.getElementsByTagNameNS(VMAPNS, 'AdBreak');
    var breakPositions = [];
    for (var i = 0; i < adbreaks.length; i++) {
      var bn = adbreaks.item(i);

      var position = bn.getAttribute("timeOffset");
      if (position.indexOf('#') === 0) {
        continue;
      }

      var adbreak = {
        ad: null,
        breakId: bn.getAttribute("breakId"),
        tracking: new TrackingEvents(bn),
        position: position
      };

      var targetedAdHandler = adHandler.bind(that, that.breaks.length);

      var vast = bn.getElementsByTagNameNS(VMAPNS, 'VASTData');
      if (vast) {
        adbreak.ad = new VASTAds(vast.item(0).getElementByTagName(null, 'VAST').item(0), targetedAdHandler);
      } else {
        var uri = bn.getElementsByTagNameNS(VMAPNS, 'AdTagURI');
        if (uri) {
          var storeAd = function(ad) {
            adbreak.ad = ad;
            if (ad !== null) {
              targetedAdHandler(ad);
            }
          };
          queryVAST(uri.item(0).textContent.replace(/\s/g, ""), storeAd);
        } else {
          console.error("No supported ad target for break #" + i);
          continue;
        }
      }

      that.breaks.push(adbreak);
      breakPositions.push(adbreak.position);
    }
    breakHandler(breakPositions);
  }, function(e) {
    console.error("Failed to load VMAP from '" + server + "':", e);
    breakHandler([]);
  });
}

/**
 * Should be called when a break is reached regardless of whether there are ads
 * available
 *
 * @param {number} break_index The index of the break that is starting
 * @return {?VASTAds} The ad data for this break or null if it has not yet been
 *   fetched
 */
VMAP.prototype.onBreakStart = function(break_index) {
  this.breaks[break_index].tracking.track("breakStart");
  return this.breaks[break_index].ad;
};

/**
 * Should be called when a break has finished regardless of whether there were
 * ads available
 *
 * @param {number} break_index The index of the break that is ending
 */
VMAP.prototype.onBreakEnd = function(break_index) {
  this.breaks[break_index].tracking.track("breakEnd");
};

/**
 * Queries the given VAST endpoint for ads and calls the given function when the
 * ads have been loaded, giving the corresponding VASTAds object
 *
 * @param {string} endpoint The VAST endpoint URL
 * @param {function(?VASTAds)} onFetched Function to call when ads fetched or
 *   null if the request to the endpoint failed
 * @param {?VASTAd} parentAd The ad containing the results from this query
 */
function queryVAST(endpoint, onFetched, parentAd) {
  fetchXML(endpoint, null, function(doc) {
    try {
      new VASTAds(doc, onFetched, parentAd);
    } catch(e) {
      console.error(e.toString());
      var s = e.stack.split(/\n/);
      for (var i = 0; i < s.length; i++) {
        var msg = s[i];
        msg = msg.replace("[arguments not available]", "");
        msg = msg.replace(/http:\/\/.*?resources\//, "");
        console.debug("\t" + msg);
      }
    }
  }, function (e) {
    console.error("Failed to load VAST from '" + endpoint + "':", e);
    onFetched(null);
  });
}

/**
 * Represents one VAST response which might contain multiple ads
 *
 * Note that this method will also start asynchronously fetching the ads
 * contained in the VAST response. It will stop fetching when it has an
 * acceptable ad for playback
 *
 * @constructor
 * @param {Element} root The root node of the VAST XML response
 * @param {function(?VASTAds)} onAdsFetched The function to call when at least
 *   one ad is available. When this function is called, it is safe to call
 *   getBestAd(). Will be passed this VASTAds object. Should be null if no
 *   callback is required. The call to getBestAd() might change over time as
 *   more ads become available.
 *
 * TODO: onAdsFetched -> onAdsAvailable
 */
function VASTAds(root, onAdsFetched, parentAd) {
  this.ads = [];
  this.onAdsFetched = onAdsFetched;
  var adElements = root.getElementsByTagNameNS(root.namespaceURI, 'Ad');
  for (var i = 0; i < adElements.length; i++) {
    var ad = new VASTAd(this, adElements.item(i), parentAd || null);
    // TODO: needs to check current() and hasSequence()
    if (ad.isEmpty()) {
      continue;
    }

    this.ads.push(ad);
    if (ad.hasData()) {
      if (onAdsFetched) {
        var oaf = this.onAdsFetched;
        this.onAdsFetched = null;
        oaf.call(this, this);
      }
    } else {
      var that = this;
      var wrapper = adElements.item(i).getElementsByTagNameNS(root.namespaceURI, 'Wrapper').item(0);
      var uri = wrapper
                .getElementsByTagNameNS(root.namespaceURI, 'VASTAdTagURI')
                .textContent
                .replace(/\s/g, "");
      var allowPods = wrapper.getAttribute("allowMultipleAds") === "true";

      var onGotFirstAd = function(ads) {
        ad.loaded(ads, allowPods);
        if (that.onAdsFetched) {
          that.onAdsFetched.call(that, that);
        }
      };
      queryVAST(uri, onGotFirstAd, ad);
    }
  }
}

/**
 * Returns an ad from the list of ads given by the VAST server
 *
 * Will prefer pods unless allowPods === false
 *
 * Note that the result of a call to this function might change over time as
 * more ads are loaded
 *
 * @param {boolean} allowPods whether to allow ad pods (multiple videos) or not
 * @return {VASTAd} An ad.
 */
VASTAds.prototype.getAd = function(allowPods) {
  var ad = null;
  if (allowPods) {
    ad = this.getAdWithSequence(1);
    if (ad && !had.current().isEmpty()) {
      return ad.current();
    }
  }

  // So, no pods available.
  // Just pick the first one we find
  // Standard does not dictate how to pick an ad...
  // Theoretically, we could look deep into the Linears to find the ad with the
  // media file that suits the player best, but that seems like overengineering.
  for (var i = 0; i < this.ads.length; i++) {
    if (this.ads[i].hasSequence()) {
      continue;
    }

    if (!this.ads[i].current().isEmpty()) {
      return this.ads[i].current();
    }
  }
};

/**
 * Returns the ad with the given sequence number
 *
 * @param {number} seq The sequence number of the ad to get
 * @return {?VASTAd} The ad with the given sequence number or null
 */
VASTAds.prototype.getAdWithSequence = function(seq) {
  for (var i = 0; i < this.ads.length; i++) {
    if (this.ads[i].isNumber(seq)) {
      return this.ads[i];
    }
  }

  return null;
};

/**
 * Represents a single VAST ad
 *
 * Beware, beyond lies dragons and pits of fire.
 *
 * @constructor
 * @param {VASTAds} vast Parent VAST record
 * @param {Element} root The root node of this <Ad> in the VAST XML response
 * @param {function} onAdFetched The function to call when the ad has been fully
 *   fetched and parsed. Until this function is called, other methods on this
 *   object may return incomplete or inconsistent results.
 */
function VASTAd(vast, root, parentAd, onAdFetched) {
  this.vast = vast;
  this.pod = vast;
  this.parentAd = parentAd;
  this.onAdFetched = onAdFetched;
  this.sequence = null;
  this.hasContent = true;
  this.loaded = true;
  this.linear = null;
  this.companions = [];
  this.companionsRequired = "none";
  this.nonlinears = [];
  this.impressions = [];
  this.currentPodAd = this;
  this.sentImpression = false;

  /**
   * Copy over tracking and creatives from parent
   */
  var i;
  if (this.parentAd !== null) {
    var pa = this.parentAd;

    this.companionsRequired = pa.companionsRequired;
    this.impressions = this.impressions.concat(pa.impressions);
    this.linear = pa.linear ? pa.linear.copy(this) : null;

    if (pa.companions.length) {
      for (i = 0; i < pa.companions.length; i++) {
        this.companions.push(pa.companions[i].copy(this));
      }
    }

    if (pa.nonlinears.length) {
      for (i = 0; i < pa.nonlinears.length; i++) {
        this.companions.push(pa.nonlinears[i].copy(this));
      }
    }
  }

  if (root.hasAttribute('sequence')) {
    this.sequence = parseInt(root.getAttribute('sequence'), 10);
  }

  var inline = root.getElementsByTagName("InLine");
  if (inline.length === 0) {
    this.loaded = false;
    inline = root.getElementsByTagName("Wrapper");
    // Note here that VASTAds will automatically fetch wrapped responses for us,
    // so we don't need to do anything special with it here
    if (wrapper.length === 0) {
      this.hasContent = false;
      // TODO: error tracking
      return;
    }
  }

  inline = inline.item(0);

  // Extract Impressions
  var imps = inline.getElementsByTagName("Impression");
  for (i = 0; i < imps.length; i++) {
    this.impressions.push(imps.item(i).textContent.replace(/\s/g, ""));
  }

  /**
   * Time to find our creatives.
   * What makes this a lot more ugly that it should be is that we have to merge
   * up any tracking or creative elements that our wrapper ad created. Not only
   * that, but the spec isn't particularly helpful in how we might figure out
   * which elements to merge, so we have to do some heuristics as well.
   * Oh well, here goes...
   */
  var creatives = inline.getElementsByTagName("Creatives");
  if (creatives.length === 0) {
    return;
  }

  creatives = creatives.item(0).getElementsByTagName("Creative");

  for (i = 0; i < creatives.length; i++) {
    var creative = creatives.item(i).firstChild;

    // skip TextNodes
    while (creative !== null && creative.nodeType === 3) {
      creative = creative.nextSibling;
    }

    if (creative === null) {
      continue;
    }

    var n;
    switch (creative.tagName) {
      case "Linear":
        n = new VASTLinear(this, creative);
        if (this.linear) {
          this.linear.augment(n);
        } else {
          this.linear = n;
        }
        break;
      /**
       * From the spec:
       *
       *   When multiple Companion creative are included in the InLine response,
       *   identifying which Companion clickthrough event shoud be associated
       *   with the Wrapper tracking element can be difficult. The video player
       *   may associate Inline Companion clickthrough activity to Wrapper
       *   <CompanionClickTracking> events at its own discretion. The Companion
       *   id attribute may be a useful association if provided, or the video
       *   player can match width and height attributes.
       *
       * Oh, yeah, and it says nothing about how to match NonLinear elements...
       */
      case "CompanionAds":
        if (creative.hasAttribute("required")) {
          this.companionsRequired = creative.getAttribute("required");
        }
        // fallthrough
      case "NonLinearAds":
        var tag = creative.tagName.replace("Ads", "");
        var cls = tag === "Companion" ? VASTCompanion : VASTNonLinear;
        var arr = tag === "Companion" ? this.companions : this.nonlinears;

        var items = creative.getElementsByTagName(tag);
        for (var j = 0; j < items.length; j++) {
          n = new cls(this, items.item(j));
          for (var k = 0; k < arr.length; k++) {
            var o = arr[k];
            if (( o.attribute('id', true)     === n.attribute('id', false)) ||
               (  o.attribute('width', true)  === n.attribute('width', false)
               && o.attribute('height', true) === n.attribute('height', false))) {
              // Fallbacks to true|false there to prevent match when attribute
              // not present
              o.augment(n);
              n = null;
            }
          }

          if (n !== null) {
            arr.push(n);
          }
        }
        break;
    }
  }
}

/**
 * Should be called the VAST response matching this wrapped ad is parsed and
 * ready.
 *
 * @param {VASTAds} ads VASTAds object wrapped by this ad
 */
VASTAd.prototype.loaded = function(ads, allowPods) {
  this.pod = ads;
  this.currentPodAd = ads.getAd(allowPods);

  if (!this.currentPodAd.isEmpty()) {
    this.loaded = true;
    if (this.onAdFetched) {
      this.onAdFetched.call(this, this);
    }
  }
};

/**
 * Returns true if impression metrics has been sent for this ad, false otherwise
 *
 * @return {boolean} true if impression metrics have been sent, false otherwise
 */
VASTAd.prototype.hasSentImpression = function() {
  return this.sentImpression;
};

/**
 * Indicate that impression metrics have been sent for this ad
 */
VASTAd.prototype.impressionSent = function() {
  this.sentImpression = true;
};

/**
 * Returns the representative ad for this ad.
 *
 * For normal ads, this should just return this ad, for pods, it should return
 * the current ad withing the pod
 *
 * @return {VASTAd} the representative ad for this ad
 */
VASTAd.prototype.current = function() {
  return this.currentPodAd;
};

/**
 * Determines if this ad has the given sequence number
 *
 * @param {number} seq The target sequence number
 * @return {boolean} true if this ad has the given sequence number, false
 *   otherwise
 */
VASTAd.prototype.isNumber = function(seq) {
  return this.sequence === seq;
};

/**
 * Determines if this ad has a sequence number
 *
 * @return {boolean} true if this ad has a sequence number, false otherwise
 */
VASTAd.prototype.hasSequence = function() {
  return this.sequence !== null;
};

/**
 * Determine if this ad has any content (wrapped or inline) or not
 *
 * @return {boolean} True if this <Ad> contains a <Wrapper> or <InLine>, false
 *   otherwise
 */
VASTAd.prototype.isEmpty = function() {
  return !this.hasContent;
};

/**
 * Determines if the current VASTAd has inline data. Returns false if it is a
 * wrapper ad entry that has not yet been loaded.
 *
 * @return {boolean} True if this ad contains an <InLine>, false otherwise
 */
VASTAd.prototype.hasData = function() {
  return this.loaded;
};

/**
 * Returns the next ad after this one (if any)
 *
 * @return {?VASTAd} The next ad or null
 */
VASTAd.prototype.getNextAd = function() {
  if (this.vast !== this.pod) {
    this.currentPodAd = this.currentPodAd.getNextAd();
    if (this.currentPod !== null) {
      return this.currentPodAd.current();
    }
  }

  if (!this.hasSequence()) {
    return null;
  }

  return this.vast.getAdWithSequence(this.sequence + 1).current();
};

/**
 * Returns the linear creative element associated with this ad.
 *
 * @return {?VASTLinear} the linear creative element associated with this ad or
 *   null
 */
VASTAd.prototype.getLinear = function() {
  return this.linear;
};

/**
 * Returns all companion banners associated with this ad.
 *
 * @return {VASTCompanion[]} all companion banners associated with this ad
 */
VASTAd.prototype.getCompanions = function() {
  return this.companions;
};

/**
 * Returns the companion for the given location id if present, null otherwise
 *
 * @param {string} id The location id to get the companion banner for
 * @returns {?VASTCompanion} the companion banner identified by the given id or
 *   null
 */
VASTAd.prototype.getCompanion = function(id) {
  for (var i = 0; i < this.companions.length; i++) {
    if (this.companions[i].attribute('id') == id) {
      return this.companions[i];
    }
  }

  return null;
};

/**
 * Returns one of "all", "any" or "none" in accordance with the VAST spec
 *
 * @return {string} all|any|none
 */
VASTAd.prototype.companionsRequired = function() {
  return this.companionsRequired;
};

/**
 * Returns all non-linear creative elements associated with this ad.
 *
 * @return {VASTNonLinear[]} all non-linear creative elements associated with
 *   this ad
 */
VASTAd.prototype.getNonLinears = function() {
  return this.nonlinears;
};

/**
 * A base class for VAST Creative elements
 *
 * @param {VASTAd} ad The ad holding this creative
 * @param {Element} root The root node of this creative in the VAST XML
 * @constructor
 */
function VASTCreative(ad, root) {
  this.root = root;
  this.tracking = new TrackingEvents(root, ad);
}

/**
 * Should be called whenever a trackable event occurs
 *
 * Trackable events in the VAST stack are:
 *   - click
 *   - creativeView
 *   - start
 *   - firstQuartile
 *   - midpoint
 *   - thirdQuartile
 *   - complete
 *   - mute
 *   - unmute
 *   - pause
 *   - rewind
 *   - resume
 *   - fullscreen
 *   - exitFullscreen
 *   - expand
 *   - collapse
 *   - acceptInvitation
 *   - close
 *   - progress
 *
 * The video player should report these whenever possible, except all the
 * progress events (start, complete, midpoint and *Quartile), which should only
 * be reported for Linear Creative elements according to the positions returned
 * from getTrackingPoints().
 *
 * This function will only do any real work if the reported event actually has a
 * tracking entry in the VAST document
 *
 * @param {string} ev The event type to report
 * @param {number} position The number of seconds into ad playback where the
 *   event occured
 * @param {string} asset The asset URI being played
 */
VASTCreative.prototype.track = function(ev, position, asset) {
  this.tracking.track(ev, {
    "CONTENTPLAYHEAD": position,
    "ASSETURI": asset
  });
};

/**
 * Returns the URL to send the user to if this creative is clicked
 *
 * @return {?string} URL to send the user to or null if none has been set
 */
VASTCreative.prototype.getClickThrough = function() {
  return this.clickThrough;
};

/**
 * Returns the value of the given attribute for the creative
 *
 * See the VAST spec for what attributes may be present on the different types
 * of creatives
 *
 * @param {string} name The attribute name
 * @param {*} [nothing] Value to return if attribute isn't present. Defaults to
 *   null
 * @return {?string} The value for that attribute for this creative or default
 *   if unset
 */
VASTCreative.prototype.attribute = function(name, nothing) {
  if (!this.root.hasAttribute(name)) {
    return nothing;
  }

  return this.root.getAttribute(name);
};

/**
 * Parses the VAST creative element at the given root node and returns an object
 * representing that linear creative
 *
 * @constructor
 * @extends VASTCreative
 * @param {VASTAd} ad The ad holding this creative
 * @param {Element} root Root node of creative
 */
function VASTLinear(ad, root) {
  VASTCreative.call(this, ad, root);
  this.mediaFiles = [];
  this.clickThrough = null;

  var i;

  var clicks = root.getElementsByTagName("VideoClicks");
  if (clicks.length) {
    clicks = clicks.item(0);
    var ct = clicks.getElementsByTagName("ClickThrough");
    if (ct.length) {
      this.clickThrough = ct.item(0).textContent.replace(/\s/g, "");
    }

    ct = clicks.getElementsByTagName("ClickTracking");
    for (i = 0; i < ct.length; i++) {
      this.tracking.addClickTracking(ct.item(i).textContent.replace(/\s/g, ""));
    }
  }

  var medias = root.getElementsByTagName("MediaFiles");
  if (!medias.length) {
    return;
  }

  medias = medias.item(0).getElementsByTagName("MediaFile");
  for (i = 0; i < medias.length; i++) {
    var m = medias.item(i);
    var mf = {};
    for (var a = 0; a < m.attributes.length; a++) {
      mf[m.attributes[a].name] = m.attributes[a].value;
    }
    mf["src"] = medias.item(i).textContent.replace(/\s/g, "");
    this.mediaFiles.push(mf);
  }
}

VASTLinear.prototype = Object.create(VASTCreative.prototype);

/**
 * Returns a new, but identical VASTLinear object pointing to the given ad
 *
 * @param {VASTAd} ad The ad holding the copy of this creative
 */
VASTLinear.prototype.copy = function(ad) {
  return new VASTLinear(ad, this.root);
};

/**
 * Adds the tracking events and creative elements found in the given VASTLinear
 * record to those currently in this creative
 *
 * @param {VASTLinear} other VASTLinear object to merge into this one
 */
VASTLinear.prototype.augment = function(other) {
  this.tracking.augment(other.tracking);
  this.clickThrough = other.clickThrough || this.clickThrough;
};

/**
 * Returns all media files associated with this linear so the caller can decide
 * which one to play
 *
 * Each object in the returned list contains a "src" attribute, as well as any
 * of the following attributes:
 *   - delivery
 *   - type
 *   - bitrate
 *   - minBitrate
 *   - maxBitrate
 *   - width
 *   - height
 *   - scalable
 *   - maintainAspectRatio
 *   - codec
 *   - src
 * according to the VAST specification.
 *
 * @return {object[]} a list of media files for this linear
 */
VASTLinear.prototype.getAllMedias = function() {
  return this.mediaFiles;
};

/**
 * This methods makes a best guess at what media file to choose for this linear
 * based on canPlay() and the given target parameters. The target object should
 * contain the width and height of the video player, as well as a target bitrate
 * if applicable. If no bitrate is given, the highest bitrate is chosen,
 * otherwise the closest bitrate is chosen.
 *
 * @param {{width: number, height: number, ?bitrate: number}} target The target
 *   video settings
 * @return {?object} a single media file with the properties given for each
 *   object in getAllMedias() or null if no media file is available
 */
VASTLinear.prototype.getBestMedia = function(target) {
  var best = Number.POSITIVE_INFINITY;
  var besti = -1;
  for (var i = 0; i < this.mediaFiles.length; i++) {
    var media = this.mediaFiles[i];
    // Root of the sum of the squares seems as good a mesure as any for a
    // two-dimensional distance. Pythagoras FTW!
    var distance = Math.sqrt(
                     Math.pow(target["width"] - media["width"], 2) +
                     Math.pow(target["height"] - media["height"], 2)
                   );

    if (distance < best) {
      best = distance;
      besti = i;
    } else if (distance === best) {
      // If the two files are equally close to the target resolution, use
      // bitrate as the pivot. Has bitrate > closer to target bitrate > highest
      // bitrate
      var other = this.mediaFiles[besti];
      var otherBR = other["bitrate"] || other["maxBitrate"];
      var mediaBR = media["bitrate"] || media["maxBitrate"];

      if (mediaBR && !otherBR) {
        besti = i;
      } else if (target["bitrate"] && otherBR && mediaBR) {
        if (Math.abs(mediaBR - target["bitrate"]) < Math.abs(otherBR - target["bitrate"])) {
          besti = i;
        }
      } else if (mediaBR > otherBR) {
        besti = i;
      }
    }
  }

  if (besti === -1) {
    return null;
  }
  return this.mediaFiles[besti];
};

/** @const **/
var VAST_LINEAR_TRACKING_POINTS = ['start',
                                   'firstQuartile',
                                   'midpoint',
                                   'thirdQuartile',
                                   'complete',
                                   'progress'];

/**
 * Returns a list of positions in the playback of this ad when track() should be
 * called. Each position is an object containing a position (either a percentage
 * into the clip given by a number suffixed with %, an absolute number of
 * seconds or one of the strings "start" or "end") and an event name. When the
 * given position is reached in the playback of the ad, VASTAd.track() should be
 * called giving the event name and the current playback position in absolute
 * number of seconds.
 *
 * Note that this function will include points for the start, complete,
 * firstQuartile, midpoint and thirdQuartile events, so these need not be
 * explicitly added. There MAY be multiple events with the same offset, in which
 * case track must be called for each one with their respective event names.
 *
 * The list will only include points that the VAST response explicitly request
 * tracking for.
 */
VASTLinear.prototype.getTrackingPoints = function() {
  var events = this.tracking.getEventsOfTypes(VAST_LINEAR_TRACKING_POINTS);
  var points = [];
  for (var i = 0; i < events.length; i++) {
    var point = {"event": events[i]["event"], "offset": null};
    switch (events[i]["event"]) {
      case "start":
        point["offset"] = "start";
        break;
      case "firstQuartile":
        point["offset"] = "25%";
        break;
      case "midpoint":
        point["offset"] = "50%";
        break;
      case "thirdQuartile":
        point["offset"] = "75%";
        break;
      case "complete":
        point["offset"] = "end";
        break;
      default:
        // progress-...
        var offset = events[i]["offset"];
        if (!offset) {
          continue;
        }

        if (offset.indexOf(':') > -1) {
          offset = parseInt(offset.substr(0,2), 10) * 3600
                 + parseInt(offset.substr(3,2), 10) * 60
                 + parseInt(offset.substr(6,2), 10);
        }
        point["offset"] = offset;
    }
    points.push(point);
  }

  return points;
};

/**
 * A base class for static (Companion or NonLinear) VAST Creative elements
 *
 * @param {VASTAd} ad The ad holding this creative
 * @param {Element} root The root node of this creative in the VAST XML
 */
function VASTStatic(ad, root) {
  VASTCreative.call(this, ad, root);
  this.resources = {
    "iframe": null,
    "html": null,
    "images": {}
  };

  var res;
  res = root.getElementsByTagName("IFrameResource");
  if (res.length > 0) {
    this.resources["iframe"] = res.item(0).textContent.replace(/\s/g, "");
  }

  res = root.getElementsByTagName("HTMLResource");
  if (res.length > 0) {
    this.resources["html"] = res.item(0).textContent.replace(/\s/g, "");
  }

  res = root.getElementsByTagName("StaticResource");
  for (var i = 0; i < res.length; i++) {
    this.resources["images"][res.item(i).getAttribute("creativeType")] = res.item(i).textContent.replace(/\s/g, "");
  }
}

VASTStatic.prototype = Object.create(VASTCreative.prototype);

/**
 * Returns all resources associated with this creative.
 *
 * @return {{?iframe: string, ?html: string, ?images}} an object representing
 *   each of the possible resources that can be used to render this creative.
 *   The iframe and html indexes have their respective URLs as values, whereas
 *   images is a list of object, each with a src and type attribute
 */
VASTStatic.prototype.getAllResources = function() {
  return this.resources;
};

/**
 * Extracts and handles ClickThrough and ClickTracking elements
 *
 * @param {string} prefix The prefix for the XML elements
 */
VASTStatic.prototype.extractClicks = function(prefix) {
  var el;
  el = this.root.getElementsByTagName(prefix + "ClickThrough");
  if (el.length) {
    this.clickThrough = el.item(0).textContent.replace(/\s/g, "");
  }

  el = this.root.getElementsByTagName(prefix + "ClickTracking");
  if (el.length) {
    this.tracking.addClickTracking(el.item(i).textContent.replace(/\s/g, ""));
  }
};

/**
 * Parses the VAST creative element at the given root node and returns an object
 * representing the corresponding Companion banner
 *
 * @constructor
 * @extends VASTStatic
 * @param {VASTAd} ad The ad holding this creative
 * @param {Element} root Root node of creative
 */
function VASTCompanion(ad, root) {
  VASTStatic.call(this, ad, root);
  this.altText = "";

  VASTStatic.prototype.extractClicks.call(this, "Companion");
  var el = root.getElementsByTagName("AltText");
  if (el.length) {
    this.altText = el.item(0).textContent.replace(/\s/g, "");
  }
}

VASTCompanion.prototype = Object.create(VASTStatic.prototype);

/**
 * Returns a new, but identical VASTCompanion object pointing to the given ad
 *
 * @param {VASTAd} ad The ad holding the copy of this creative
 */
VASTCompanion.prototype.copy = function(ad) {
  return new VASTCompanion(ad, this.root);
};

/**
 * Adds the tracking events and creative elements found in the given
 * VASTCompanion record to those currently in this creative
 *
 * @param {VASTCompanion} other VASTCompanion object to merge into this one
 */
VASTCompanion.prototype.augment = function(other) {
  this.tracking.augment(other.tracking);
  this.clickThrough = other.clickThrough || this.clickThrough;
  this.altText = other.altText || this.altText;
};

/**
 * Returns the alt text given for this creative
 *
 * @return {string} alternative text for this creative
 */
VASTCompanion.prototype.getAltText = function() {
  return this.altText;
};

/**
 * Parses the VAST creative element at the given root node and returns an object
 * representing the corresponding NonLinear
 *
 * @constructor
 * @extends VASTStatic
 * @param {VASTAd} ad The ad holding this creative
 * @param {Element} root Root node of creative
 */
function VASTNonLinear(ad, root) {
  VASTStatic.call(this, ad, root);
  VASTStatic.prototype.extractClicks.call(this, "NonLinear");
}

VASTNonLinear.prototype = Object.create(VASTStatic.prototype);

/**
 * Adds the tracking events and creative elements found in the given
 * VASTNonLinear record to those currently in this creative
 *
 * @param {VASTNonLinear} other VASTNonLinear object to merge into this one
 */
VASTNonLinear.prototype.augment = function(other) {
  this.tracking.augment(other.tracking);
  this.clickThrough = other.clickThrough || this.clickThrough;
};

/**
 * Returns a new, but identical VASTNonLinear object pointing to the given ad
 *
 * @param {VASTAd} ad The ad holding the copy of this creative
 */
VASTNonLinear.prototype.copy = function(ad) {
  return new VASTNonLinear(ad, this.root);
};
