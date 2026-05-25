# @hdt/hearthmirror-mac-spike

> **Exploratory.** This package validates [ADR 0002](../../docs/adr/0002-hearthmirror-mac-bridge.md)
> by checking whether napi-rs `darwin-arm64` + `task_for_pid` +
> `mach_vm_read_overwrite` can read the 64-bit Hearthstone Mac client.
>
> **Do not depend on this package.** It will be deleted at the end of
> the `spike-hearthmirror-mac-bridge` change.

## Scope

This crate intentionally does **not** implement Mono reflection,
field-offset probing, IReflection methods, or any production code path.
Its only job is to answer three yes/no questions in time-boxed fashion:

1. Can a 64-bit napi-rs `.node` addon be ad-hoc signed with
   `com.apple.security.cs.debugger` and successfully call
   `task_for_pid` + `mach_vm_read_overwrite` against the Hearthstone
   process?
2. Can the resulting `darwin-arm64` `.node` be loaded by Electron 37
   running on Node 22?
3. Can `CGWindowListCopyWindowInfo` + Accessibility API be used from
   inside the addon to read the Hearthstone window frame and
   fullscreen flag?

## Prerequisites

Before running the spike on a real Apple Silicon machine:

- **rustc ≥ 1.88** (napi 3.9 requires it). Run `rustup update stable`
  if you're on an older toolchain — known mismatch on the dev machine
  was 1.79.
- **macOS 12+** on Apple Silicon.
- **Hearthstone Mac client** installed at `/Applications/Hearthstone/`
  (or any path containing `/MacOS/Hearthstone`).

## Build & sign

```bash
pnpm --filter @hdt/hearthmirror-mac-spike build
bash ../../scripts/codesign-mac-spike.sh
```

Expected output: `hearthmirror-mac-spike.darwin-arm64.node` next to
`package.json`, and `codesign -dv` reporting the entitlements above
applied.

## Note on `.cargo/config.toml`

The spike ships its own `.cargo/config.toml` that overrides the global
USTC git-mirror replacement with the Tuna sparse mirror. This avoids
an unrelated mirror outage from blocking spike validation. The file
is deleted at teardown along with the rest of the package.

## Reference

- Plan: [`docs/spikes/0006-hearthmirror-mac-spike.md`](../../docs/spikes/0006-hearthmirror-mac-spike.md)
- Report (filled in after real-machine run): [`docs/spikes/0006-hearthmirror-mac-spike-report.md`](../../docs/spikes/0006-hearthmirror-mac-spike-report.md)
- ADR: [`docs/adr/0002-hearthmirror-mac-bridge.md`](../../docs/adr/0002-hearthmirror-mac-bridge.md)
- OpenSpec change: [`openspec/changes/spike-hearthmirror-mac-bridge/`](../../openspec/changes/spike-hearthmirror-mac-bridge/)
