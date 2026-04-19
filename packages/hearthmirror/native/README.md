# @hdt/hearthmirror-native

Internal Rust crate that backs `@hdt/hearthmirror`. Compiled to a 64-bit
napi-rs cdylib (`hearthmirror-native.win32-x64-msvc.node`). Loaded by
Electron main process via `@hdt/hearthmirror`'s TypeScript wrapper.

See [ADR 0001](../../docs/adr/0001-hearthmirror-bridge.md) for the
architecture rationale and binding constraints.

## Build

```powershell
pnpm install
pnpm build
```

## Test

```powershell
cargo test --release          # unit tests, no Hearthstone needed
cargo test --release --features integration   # integration tests, needs Hearthstone running
```
