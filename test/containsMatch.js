var assert = buster.referee.assert;
var refute = buster.referee.refute;

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

buster.referee.add("containsMatch", {
    assert: function (haystack, needle) {
      var f = buster.referee.fail;
      buster.referee.fail = function (message) { throw new AssertionError(message) };
      var cm = containsMatch(haystack, needle);
      buster.referee.fail = f;
      return cm;
    },
    assertMessage: "${0} expected to contain match for ${1}!",
    refuteMessage: "${0} expected not to contain match for ${1}!",
    expectation: "toContainMatch",
});
