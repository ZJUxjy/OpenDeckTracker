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

## Build & sign

```bash
pnpm --filter @hdt/hearthmirror-mac-spike build
bash ../../scripts/codesign-mac-spike.sh
```

Expected output: `hearthmirror-mac-spike.darwin-arm64.node` next to
`package.json`, and `codesign -dv` reporting the entitlements above
applied.

## Reference

- Plan: [`docs/spikes/0006-hearthmirror-mac-spike.md`](../../docs/spikes/0006-hearthmirror-mac-spike.md)
- Report (filled in after real-machine run): [`docs/spikes/0006-hearthmirror-mac-spike-report.md`](../../docs/spikes/0006-hearthmirror-mac-spike-report.md)
- ADR: [`docs/adr/0002-hearthmirror-mac-bridge.md`](../../docs/adr/0002-hearthmirror-mac-bridge.md)
- OpenSpec change: [`openspec/changes/spike-hearthmirror-mac-bridge/`](../../openspec/changes/spike-hearthmirror-mac-bridge/)
