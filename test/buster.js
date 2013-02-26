var config = module.exports;

config["VAST tests"] = {
    env: "browser",
    rootPath: "../",
    resources: [
      "test/assets/*.xml"
    ],
    sources: [
        "test/containsMatch.js",
        "src/vast-vmap.js"
    ],
    tests: [
        "test/test-*.js"
    ]
};
