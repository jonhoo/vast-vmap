function containsMatch(haystack, needle) {
  for (var i in haystack) {
    if (!haystack.hasOwnProperty(i)) { continue; }

    try {
      assert.match(haystack[i], needle);
      return true;
    } catch (e) { }
  }

  return false;
}

buster.assertions.add("containsMatch", {
    assert: function (haystack, needle) {
      var f = buster.assertions.fail;
      buster.assertions.fail = function (message) { throw new AssertionError(message) };
      var cm = containsMatch(haystack, needle);
      buster.assertions.fail = f;
      return cm;
    },
    assertMessage: "${0} expected to contain match for ${1}!",
    refuteMessage: "${0} expected not to contain match for ${1}!",
    expectation: "toContainMatch",
});
