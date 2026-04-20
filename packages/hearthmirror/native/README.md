# @hdt/hearthmirror-native

Internal Rust crate that backs `@hdt/hearthmirror`. Compiled to a 64-bit
napi-rs cdylib (`hearthmirror-native.win32-x64-msvc.node`). Loaded by
Electron main process via `@hdt/hearthmirror`'s TypeScript wrapper.

See [ADR 0001](../../docs/adr/0001-hearthmirror-bridge.md) for the
architecture rationale and binding constraints.

## Build

```powershell
pnpm install
pnpm --filter @hdt/hearthmirror-native build
```

The release build bundles the current native artifact at:

- `packages/hearthmirror/native/hearthmirror-native.win32-x64-msvc.node`

## Offset probing and config

- `MonoOffsets::bundled_unity_2021_3()` loads the crate-bundled JSON config at
  `config/mono-offsets/unity-2021.3.json` via `include_str!`, so no runtime file
  deployment step is needed.
- `OffsetProber::probe_all()` applies the bundled config as defaults, then
  re-probes critical runtime offsets (`MonoClass`, `MonoImage`, `MonoAssembly`)
  and best-effort field offsets before live `MonoDomain.domain_assemblies`
  discovery.
- `find_image()` still resolves images from live `domain_assemblies` data and
  matches names case-insensitively.
- Mono runtime lookup follows the constrained fallback order:
  `mono-2.0-bdwgc.dll` → `mono-2.0-sgen.dll` → `mono-2.0-boehm.dll` →
  any `mono-*.dll`.

## Verification

```powershell
cargo clippy -- -D warnings -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic
cargo test
cargo test --release
cargo test --release --features integration   # integration tests, needs Hearthstone running
```
