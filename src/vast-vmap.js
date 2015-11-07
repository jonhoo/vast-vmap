/* jshint loopfunc:true,sub:true */
// TODO: timecodeTo/FromString should not be on VASTCreative - useful elsewhere

/**
 * @const
 */
var VMAPNS = "http://www.iab.net/vmap-1.0";

/**
 * exports
 */
var VASTAds, VASTAd, VASTLinear, VASTNonLinear, VASTCompanion;

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
function fetchXML(url, identifier, onSuccess, onFailure) {
  var request;

  // IE 9 CORS method
  if (window.XDomainRequest)
  {
    request = new XDomainRequest();

    request.onload = function()
    {

      if (request.contentType != null && request.responseText != null)
      {

        // IE < 10 requires to parse the XML as string in order to use the getElementsByTagNameNS method
        var parser = new DOMParser();
        var doc = parser.parseFromString(request.responseText, 'text/xml');

        onSuccess(doc, identifier);

      }
      else
        onFailure(request, identifier);

    };

    request.onerror = request.ontimeout = function()
    {
      onFailure(request, identifier);
    };

  }
  else // The standard one
  {
    request = new XMLHttpRequest();

    request.onreadystatechange = function()
    {

      if (request.readyState === 4)
      {

        if (request.status === 200)
        {

          if (request.responseXML !== null)
          onSuccess(request.responseXML, identifier);
          else
          onFailure(request, identifier);

        } else
        onFailure(request, identifier);

      }
    };

  }

  request.open("GET", url, true);
  request.withCredentials = true;   // Accept cookies
  request.send();
}

/**
 * Queries the given VAST endpoint for ads and calls the given function when the
 * ads have been loaded, giving the corresponding VASTAds object
 *
 * @param {string} endpoint The VAST endpoint URL
 * @param {function(?VASTAds)} onFetched Function to call when ads fetched or
 *   null if the request to the endpoint failed
 * @param {?VASTAd} parentAd The ad containing the results from this query
 * @param {function(?)} onFinish Function to call when VAST request is finished
 */
function queryVAST(endpoint, onFetched, parentAd, onFinish) {
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

    if (onFinish) onFinish();

  }, function (e) {
    console.error("Failed to load VAST from '" + endpoint + "':", e);
    onFetched(null);

    if (onFinish) onFinish();
  });
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

  if (root === null) {
    return;
  }

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

    var offset = null;
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
 * Returns a new, but identical TrackingEvents object
 *
 * @param {VASTAd} ad The to associate the new copy with
 */
TrackingEvents.prototype.copy = function(ad) {
  var n = Object.create(TrackingEvents.prototype);
  n.events = {};
  for (var e in this.events) {
    if (this.events.hasOwnProperty(e)) {
      n.events[e] = [].concat(this.events[e]);
    }
  }
  n.ad = ad;
  return n;
};


/**
 * Sends a GET request to the given URL
 *
 * @param {string} url The URL to request
 */
TrackingEvents.prototype.finger = function(url) {
  var request = new XMLHttpRequest();
  request.open("get", url, true);
  request.send();
};

/**
 * Adds the tracking events found in the given TrackingEvents object to this one
 *
 * @param {TrackingEvents} other TrackingEvents object to merge in
 */
TrackingEvents.prototype.augment = function(other) {
  for (var e in other.events) {
    if (!other.events.hasOwnProperty(e)) {
      continue;
    }

    if (!this.events[e]) {
      this.events[e] = other.events[e];
    } else {
      this.events[e] = this.events[e].concat(other.events[e]);
    }
  }
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
 * @returns {object[]} A list of objects each representing one tracked event.
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
  }

  return ret;
};

/**
 * Notifies all URIs that have subscribed to the given event type.
 *
 * @param {string} ev Event type to notify
 * @param {object} macros Macros to replace in the tracking URIs
 */
TrackingEvents.prototype.track = function(ev, macros) {
  if (!this.events[ev] || this.events[ev].length === 0) {
    return;
  }

  var evs = [].concat(this.events[ev]);
  var i;

  for (var m in macros) {
    if (!macros.hasOwnProperty(m)) {
      continue;
    }

    macros["[" + m + "]"] = encodeURIComponent(macros[m]);
    delete macros[m];
  }

  // First creative view for a creative within an ad should count as an
  // impression
  if (ev === "creativeView") {
    var ad = this.ad;
    while (ad !== null && !ad.hasSentImpression()) {
      ad.impressionSent();
      for (i = 0; i < ad.impressions.length; i++) {
        evs.push({"url": ad.impressions[i]});
      }
      ad = ad.parentAd;
    }
  }

  var that = this;
  for (i = 0; i < evs.length; i++) {
    var e = evs[i];
    var url = e["url"];

    // Standard dictates 8 digits of randomness
    var rand = '' + parseInt(Math.random() * 99999999, 10);
    while (rand.length !== 8) {
      rand = '0' + rand;
    }
    macros["[CACHEBUSTING]"] = rand;

    for (m in macros) {
      if (!macros.hasOwnProperty(m)) {
        continue;
      }
      url = url.replace(m, macros[m]);
    }

    that.finger(url);
  }
};

/**
 * Query the server for the available Ad Breaks and pass them to the callback
 *
 * This function will also asynchronously parse (and fetch if necessary) the
 * VAST ad specifications for each break in the VMAP response.
 *
 * @constructor
 * @param {string} server The server URL to contact to retrieve the VMAP
 * @param {function(number, string, VASTAds)} adHandler The function to call
 *   whenever the VAST ad response for an ad break has been fetched and/or
 *   parsed. This function will be called at most once for every ad break given
 *   to breakHandler. The first parameter to the function is the corresponding
 *   index in the list passed to the breakHandler, and the second parameter is
 *   the VASTAds object holding the possible ads to play for that break.
 * @param {?function} breakHandler The function to call when Ad Breaks have been
 *   fetched. This function will receive a list of break positions. Each
 *   position can either be a percentage (<1), a number of seconds into the
 *   content video or one of the string literals "start" or "end". Ordinal
 *   positions are not supported and thus will not be passed.
 */
function VMAP(server, adHandler, breakHandler) {
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
        tracking: new TrackingEvents(bn, null),
        position: position
      };

      var targetedAdHandler = adHandler.bind(that, that.breaks.length, position);

      var vast = bn.getElementsByTagNameNS(VMAPNS, 'VASTData');
      if (vast) {
        adbreak.ad = new VASTAds(vast.item(0).getElementByTagName(null, 'VAST').item(0), targetedAdHandler);
      } else {
        var uri = bn.getElementsByTagNameNS(VMAPNS, 'AdTagURI');
        if (uri) {
          var storeAd;
          (function(adbreak) {
            storeAd = function(ad) {
              adbreak.ad = ad;
              if (ad !== null) {
                targetedAdHandler(ad);
              }
            };
          })(adbreak);
          queryVAST(uri.item(0).textContent.replace(/\s/g, ""), storeAd);
        } else {
          console.error("No supported ad target for break #" + i);
          continue;
        }
      }

      that.breaks.push(adbreak);
      breakPositions.push(adbreak.position);
    }

    if (typeof breakHandler === 'function') {
      breakHandler(breakPositions);
    }
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
 * @returns {?VASTAds} The ad data for this break or null if it has not yet been
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
 * Represents one VAST response which might contain multiple ads
 *
 * Note that this method will also start asynchronously fetching the ads
 * contained in the VAST response. It will stop fetching when it has an
 * acceptable ad for playback
 *
 * @constructor
 * @param {Element} root The root node of the VAST XML response
 * @param {function(?VASTAds)} onAdsAvailable The function to call when at least
 *   one ad is available. When this function is called, it is safe to call
 *   getBestAd(). Will be passed this VASTAds object. Should be null if no
 *   callback is required. The call to getBestAd() might change over time as
 *   more ads become available.
 */
function VASTAds(root, onAdsAvailable, parentAd) {
  this.ads = [];
  this.onAdsAvailable = onAdsAvailable;

  // root.namespaceURI return undefined in Google Chrome 46
  // var adElements = root.getElementsByTagNameNS(root.namespaceURI, 'Ad');

  // Workaround (See https://code.google.com/p/chromium/issues/detail?id=549103)
  var adElements = root.getElementsByTagNameNS('*', 'Ad');

  for (var i = 0; i < adElements.length; i++) {
    var ad = new VASTAd(this, adElements.item(i), parentAd || null);
    if (ad.isEmpty()) {
      continue;
    }

    this.ads.push(ad);
    if (ad.hasData() && (!ad.hasSequence() || ad.isNumber(1))) {
      if (onAdsAvailable) {
        // Needs to be reset before calling user function since user function
        // may take long to execute
        var oaf = this.onAdsAvailable;
        this.onAdsAvailable = null;
        oaf.call(this, this);
      }
    } else {
      var that = this;
      var wrapper = adElements.item(i).getElementsByTagName('Wrapper').item(0);
      var uri = wrapper.getElementsByTagName('VASTAdTagURI');
      if (uri.length === 0) {
        // No uri...
        continue;
      }

      uri = uri.item(0).textContent.replace(/\s/g, "");
      var allowPods = wrapper.getAttribute("allowMultipleAds") === "true";

      var onGotFirstAd;
      (function(ad, allowPods, that) {
        onGotFirstAd = function(ads) {
          ad.onLoaded(ads, allowPods);
          if (that.onAdsAvailable) {
            var oaf = that.onAdsAvailable;
            that.onAdsAvailable = null;
            oaf.call(that, that);
          }
        };
      })(ad, allowPods, that);
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
 * @returns {VASTAd} An ad.
 */
VASTAds.prototype.getAd = function(allowPods) {
  var ad = null;
  if (allowPods) {
    ad = this.getAdWithSequence(1);
    if (ad && !ad.current().isEmpty()) {
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
 * @returns {?VASTAd} The ad with the given sequence number or null
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
 * TODO: Add interface for reporting errors, possibly also "rejecting" the ad
 * TODO: Add support for <Icons> as dictated by the standard
 * TODO: Add method for tracking impression without tracking creative view
 *
 * @constructor
 * @param {VASTAds} vast Parent VAST record
 * @param {Element} root The root node of this <Ad> in the VAST XML response
 * @param {function} onAdAvailable The function to call when the ad has been
 *   fully fetched and parsed. Until this function is called, other methods on
 *   this object may return incomplete or inconsistent results.
 */
function VASTAd(vast, root, parentAd, onAdAvailable) {
  this.vast = vast;
  this.pod = vast;
  this.parentAd = parentAd;
  this.onAdAvailable = onAdAvailable;
  this.sequence = null;
  this.hasContent = true;
  this.loaded = true;
  this.linear = null;
  this.companions = [];
  // TODO: Enforce the companions required attribute
  // Can that even be done here, or must it be done by interface?
  // Must give interface a way of "rejecting" an ad?
  this.companionsRequired = "none";
  this.nonlinears = [];
  this.nonlinearsTracking = null;
  this.impressions = [];
  this.currentPodAd = this;
  this.sentImpression = false;
  this.properties = {};

  /**
   * Copy over tracking and creatives from parent
   */
  var i, k;
  if (this.parentAd !== null) {
    var pa = this.parentAd;

    this.companionsRequired = pa.companionsRequired;
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

    if (pa.nonlinearsTracking !== null) {
      this.nonlinearsTracking = pa.nonlinearsTracking.copy(this);
    }

    for (k in pa.properties) {
      if (pa.properties.hasOwnProperty(k)) {
        this.properties[k] = pa.properties[k];
      }
    }
  }

  if (this.nonlinearsTracking === null) {
    this.nonlinearsTracking = new TrackingEvents(null, this);
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
    if (inline.length === 0) {
      this.hasContent = false;
      // TODO: error tracking
      return;
    }
  }

  inline = inline.item(0);

  var prop = inline.firstChild;
  while (prop !== null) {
    if (prop.nodeType === 1) {
      switch (prop.tagName) {
        case 'Creatives':
        case 'InLine':
        case 'Wrapper':
        case 'Impression':
        case 'VASTAdTagURI':
        case 'Error':
          break;
        default:
          this.properties[prop.tagName] = prop.textContent.replace(/^\s*|\s*$/g, "");
      }
    }
    prop = prop.nextSibling;
  }

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
        /* falls through */
      case "NonLinearAds":
        var tag = creative.tagName.replace("Ads", "");
        var cls = tag === "Companion" ? "VASTCompanion" : "VASTNonLinear";
        var arr = tag === "Companion" ? this.companions : this.nonlinears;

        if (tag === "NonLinear") {
          var track = new TrackingEvents(creative, this);
          this.nonlinearsTracking.augment(track);
        }

        // Since we add to arr, we store the length to we don't start merging
        // sibling elements.
        var arrl = arr.length;

        var items = creative.getElementsByTagName(tag);
        for (var j = 0; j < items.length; j++) {
          n = new window[cls](this, items.item(j));

          for (k = 0; k < arrl; k++) {
            var o = arr[k];

            // Match if two values are equal or only one is set
            var m1 = o.attribute('id', n.attribute('id')) === n.attribute('id', o.attribute('id'));
            var m2 = o.attribute('width', n.attribute('width')) === n.attribute('width', o.attribute('width'));
            var m3 = o.attribute('height', n.attribute('height')) === n.attribute('height', o.attribute('height'));

            // Set if both values are set
            var idset = o.attribute('id') !== undefined && n.attribute('id') !== undefined;
            var widthset = o.attribute('width') !== undefined && n.attribute('width') !== undefined;
            var heightset = o.attribute('height') !== undefined && n.attribute('height') !== undefined;

            // If all match and at least one set for both
            if (m1 && m2 && m3 && (idset || widthset || heightset)) {
              // If we do this merge then the n is basically a copy of o, which
              // is already in the array, so we don't want to add it again.
              o.augment(n);
              n = null;
              break;
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
 * Returns the value of the given tag for this ad
 *
 * See the VAST spec for what tags may be present on an ad
 * Note that ad tags are merged from the parent
 *
 * @param {string} tag The attribute to get
 * @param {*} [nothing] Value to return if tag isn't present. Defaults to
 *   undefined
 * @returns {?string} The value for that tag for this ad or default if unset
 */
VASTAd.prototype.getTag = function(tag, nothing) {
  if (!this.properties.hasOwnProperty(tag)) {
    return nothing;
  }

  return this.properties[tag];
};

/**
 * Should be called the VAST response matching this wrapped ad is parsed and
 * ready.
 *
 * @param {VASTAds} ads VASTAds object wrapped by this ad
 */
VASTAd.prototype.onLoaded = function(ads, allowPods) {
  this.pod = ads;
  this.currentPodAd = ads.getAd(allowPods);

  if (!this.currentPodAd.isEmpty()) {
    this.loaded = true;
    if (this.onAdAvailable) {
      this.onAdAvailable.call(this, this);
    }
  }
};

/**
 * Returns true if impression metrics has been sent for this ad, false otherwise
 *
 * @returns {boolean} true if impression metrics have been sent, false otherwise
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
 * @returns {VASTAd} the representative ad for this ad
 */
VASTAd.prototype.current = function() {
  return this.currentPodAd;
};

/**
 * Determines if this ad has the given sequence number
 *
 * @param {number} seq The target sequence number
 * @returns {boolean} true if this ad has the given sequence number, false
 *   otherwise
 */
VASTAd.prototype.isNumber = function(seq) {
  return this.sequence === seq;
};

/**
 * Determines if this ad has a sequence number
 *
 * @returns {boolean} true if this ad has a sequence number, false otherwise
 */
VASTAd.prototype.hasSequence = function() {
  return this.sequence !== null;
};

/**
 * Determine if this ad has any content (wrapped or inline) or not
 *
 * @returns {boolean} True if this <Ad> contains a <Wrapper> or <InLine>, false
 *   otherwise
 */
VASTAd.prototype.isEmpty = function() {
  return !this.hasContent;
};

/**
 * Determines if the current VASTAd has inline data. Returns false if it is a
 * wrapper ad entry that has not yet been loaded.
 *
 * @returns {boolean} True if this ad contains an <InLine>, false otherwise
 */
VASTAd.prototype.hasData = function() {
  return this.loaded;
};

/**
 * Returns the next ad after this one (if any)
 *
 * TODO: In VAST 2.0, this should return any next ad, not just based on seq
 *
 * @returns {?VASTAd} The next ad or null
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
 * @returns {?VASTLinear} the linear creative element associated with this ad or
 *   null
 */
VASTAd.prototype.getLinear = function() {
  return this.linear;
};

/**
 * Returns all companion banners associated with this ad.
 *
 * @returns {VASTCompanion[]} all companion banners associated with this ad
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
    if (this.companions[i].attribute('id') === id) {
      return this.companions[i];
    }
  }

  return null;
};

/**
 * Returns one of "all", "any" or "none" in accordance with the VAST spec
 *
 * @returns {string} all|any|none
 */
VASTAd.prototype.companionsRequired = function() {
  return this.companionsRequired;
};

/**
 * Returns all non-linear creative elements associated with this ad.
 *
 * @returns {VASTNonLinear[]} all non-linear creative elements associated with
 *   this ad
 */
VASTAd.prototype.getNonLinears = function() {
  return this.nonlinears;
};

/**
 * A base class for VAST Creative elements
 *
 * TODO: Add support for getting adParameters and duration (for Linears)
 *
 * @param {VASTAd} ad The ad holding this creative
 * @param {Element} root The root node of this creative in the VAST XML
 * @constructor
 */
function VASTCreative(ad, root) {
  this.root = root;
  this.clickThrough = null;
  if (root.tagName === "NonLinear") {
    root = root.parentNode;
  }
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
 *   - skip
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
    "CONTENTPLAYHEAD": this.timecodeToString(position),
    "ASSETURI": asset
  });
};

/**
 * Takes a timestamp and returns it as a timecode string HH:MM:SS
 *
 * @param {number} time Timestamp in seconds
 * @returns {string} Timestamp as timecode
 */
VASTCreative.prototype.timecodeToString = function(time) {
  var hrs = '0' + parseInt(time/3600, 10);
  var mts = '0' + parseInt((time % 3600)/60, 10);
  var scs = '0' + time % 60;
  var str = hrs + ':' + mts + ':' + scs;
  return str.replace(/(^|:|\.)0(\d{2})/g, "$1$2");
};

/**
 * Takes a string and returns it as a number of seconds if it is a timecode,
 * otherwise just returns the string (XX% for example)
 *
 * @param {string} time Timecode
 * @returns {number|string} Timecode in seconds or input string
 */
VASTCreative.prototype.timecodeFromString = function(time) {
  if (time.indexOf(':') === -1) {
    return time;
  }

  return parseInt(time.substr(0,2), 10) * 3600 +
         parseInt(time.substr(3,2), 10) * 60 +
         parseInt(time.substr(6,2), 10);
};

/**
 * Returns the URL to send the user to if this creative is clicked
 *
 * @returns {?string} URL to send the user to or null if none has been set
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
 * Handles any timecode attribute as a timecode and converts it to a number
 *
 * @param {string} name The attribute name
 * @param {*} [nothing] Value to return if attribute isn't present. Defaults to
 *   undefined
 * @returns {?string} The value for that attribute for this creative or default
 *   if unset
 */
VASTCreative.prototype.attribute = function(name, nothing) {
  // TODO: attributes should be merged when augmented
  if (!this.root.hasAttribute(name)) {
    return nothing;
  }

  var attr = this.root.getAttribute(name);
  switch (name) {
    case 'skipoffset':
    case 'duration':
    case 'offset':
    case 'minSuggestedDuration':
      attr = this.timecodeFromString(attr);
  }
  return attr;
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
  this.duration = null;

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

  var d = root.getElementsByTagName("Duration");
  if (d.length) {
    this.duration = this.timecodeFromString(d.item(0).textContent.replace(/\s/g, ""));
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
 * Returns the duration for this linear creative, or null if not set
 *
 * @returns {?number} The duration of this linear in seconds, null otherwise
 */
VASTLinear.prototype.getDuration = function() {
  return this.duration;
};

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
  this.duration = other.duration || this.duration;
  this.mediaFiles = other.mediaFiles.slice(0) || this.mediaFiles.slice(0);
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
 * @returns {object[]} a list of media files for this linear
 */
VASTLinear.prototype.getAllMedias = function() {
  return this.mediaFiles;
};

/**
 * This methods makes a best guess at what media file to choose for this linear
 * based on the given target parameters. The target object should contain the
 * width and height of the video player, as well as a target bitrate if
 * applicable. If no bitrate is given, the highest bitrate is chosen, otherwise
 * the closest bitrate is chosen.
 *
 * @param {{width: number, height: number, ?bitrate: number}} target The target
 *   video settings
 * @returns {?object} a single media file with the properties given for each
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
  'progress',
  'skip'
];

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
      case "skip":
        var skipOffset = this.attribute('skipoffset', 0);
        point["offset"] = "" + Math.round((skipOffset / this.duration) * 100) + "%";
        break;
      default:
        // progress-...
        var offset = events[i]["offset"];
        if (!offset) {
          continue;
        }

        point["offset"] = Math.round(VASTCreative.prototype.timecodeFromString(offset) / this.duration * 100) + "%";
    }
    points.push(point);
  }

  // Now sort all events based on their offset. 'Start' events automatically
  // added to the beginning, 'end' events added at the end.
  var sortable = [];
  for (var index in points) {
      var val = parseInt(points[index]['offset']);
      if (points[index]['offset'] == 'start') {
          val = 0;
      }
      else if (points[index]['offset'] == 'complete') {
          val = 100;
      }

      sortable.push([index, val]);
  }

  sortable.sort(function(a, b) {
      return a[1] - b[1];
  });

  var retval = [];
  for (var i = 0; i < sortable.length; i++) {
      retval.push(points[sortable[i][0]]);
  }

  return retval;
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
 * Adds the tracking events and creative elements found in the given
 * VASTCompanion record to those currently in this creative
 *
 * @param {VASTCompanion} other VASTCompanion object to merge into this one
 */
VASTStatic.prototype.augment = function(other) {
  this.tracking.augment(other.tracking);
  this.clickThrough = other.clickThrough || this.clickThrough;
  this.resources["iframe"] = other.resources["iframe"] || this.resources["iframe"];
  this.resources["html"] = other.resources["html"] || this.resources["html"];
  for (var t in other.resources["images"]) {
    if (other.resources["images"].hasOwnProperty(t)) {
      this.resources["images"][t] = other.resources["images"][t];
    }
  }
};

/**
 * Returns all resources associated with this creative.
 *
 * @returns {{?iframe: string, ?html: string, ?images}} an object representing
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
    this.tracking.addClickTracking(el.item(0).textContent.replace(/\s/g, ""));
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
  VASTStatic.prototype.augment.call(this, other);
  this.altText = other.altText || this.altText;
};

/**
 * Returns the alt text given for this creative
 *
 * @returns {string} alternative text for this creative
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
  this.tracking = ad.nonlinearsTracking;
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
  VASTStatic.prototype.augment.call(this, other);
};

/**
 * Returns a new, but identical VASTNonLinear object pointing to the given ad
 *
 * @param {VASTAd} ad The ad holding the copy of this creative
 */
VASTNonLinear.prototype.copy = function(ad) {
  return new VASTNonLinear(ad, this.root);
};
