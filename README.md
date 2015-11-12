# What is this? #
This is a JavaScript library for working with Ad Servers providing ads
through IAB [VAST](http://www.iab.net/vast) and
[VMAP](http://www.iab.net/vmap) formatted responses. VAST is the
standard for delivering the ads, whereas VMAP is the standard for
deciding where in the video stream ads should go.

The library has not yet been tested **at all**, just written according
to the specifications. It is likely that it does not work. Hopefully it
will evolve over time now that the ground work has been put down though.

# Do you have an example? #

Nope, not yet. I'll probably write a HTML5 video integration soon that
should act like a demo though. Watch this space.

# How do I use it? #

For now, read the JSDoc. I think it should be fairly straightforward,
but maybe not. When I get around to writing a demo, things might be more
clear. Would be good to have a VAST/VMAP provider that were willing to
put up a test service though.

Also, note that this is a very low-level library. It parses VAST/VMAP,
handles wrapped responses and tracking for you and tells you which ads
to play when. It does no **do** anything unless you ask for something or
tell it do do something.  For example, you have to explicitly call
`VASTCreative#track` on a creative any time a trackable event happens.
The library will not watch for the events since it does not care how you
display the data.

# Level of standards support #

Should support most sensible VAST 3.0 (and therefore also 2.0) and VMAP
1.0 resources. Also supports some silly things like deeply nested
Wrapper resources and even more silly things like AdPods inside AdPods
inside AdPods (which is possble because of the weird way IAB have
decided to do Wrapper responses). The following things have been left
out mostly intentionally:

  - Sequence numbers for creatives (because the standard doesn't really
    give a use case for them)
  - Any kind of extensions
  - Survey elements (what are these anyway?)
  - Anything that has to do with pricing or money
  - Anything related to "apiFramework"

# Known issues #

The following is a list of features that I do want to implement, but I
just haven't gotten around to them yet.

  - Enforcement of the "required" attribute for Companion Ads
  - An interface for reporting errors so that they are reported back to
    the Ad Server
  - adParameters for Flash StaticResources
  - Industry Icons (which are **required** according to the standard).
    This is simply because I haven't gotten around to it yet. Also,
    they're not very well described in the standard.

# Testing #

I've added some rudimentary tests using BusterJS based on some VAST 2.0 XML files
distributed by the IAB. Feel free to add more if you want to. Still need a good
example VMAP document though...

In order to run the tests, start by installing dev dependencies:

`npm install`

And then:

`grunt test`

You can also watch for changes and immediately run the tests:

`grunt watch:tests`

# Support #

This code is not officially supported by anyone, not even me. I give no
guarantees that it is working, nor that it will work any time soon.
Don't come running to me if your server catches on fire because of
using this libary.

Any issues should be submitted at the [Github issues
page](https://github.com/jonhoo/vast-vmap/issues). Pull requests are
more than welcome!
