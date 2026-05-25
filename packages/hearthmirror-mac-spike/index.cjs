// Placeholder runtime stub for @hdt/hearthmirror-mac-spike.
//
// `napi build` overwrites this file with the napi-rs generated CJS
// loader after a real build. The placeholder rejects all calls so
// that the main-process trigger can run *before* the first napi
// build (in CI / on Windows / on a fresh clone) without crashing.
//
// Throw-away — deleted at teardown.

const stubError = () =>
  Promise.reject(
    new Error(
      'hearthmirror-mac-spike has not been built yet. ' +
        'Run `pnpm --filter @hdt/hearthmirror-mac-spike build` ' +
        'on a macOS host before invoking this addon.',
    ),
  );

module.exports.spikeReadMacho = stubError;
module.exports.spikeReadHearthstoneWindow = stubError;
