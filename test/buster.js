var config = module.exports;

config["VAST tests"] = {
    env: "browser",
    rootPath: "../",
    resources: [
      "test/assets/*.xml"
    ],
    sources: [
        "src/vast-vmap.js"
    ],
    tests: [
        "test/test-*.js"
    ]
};
