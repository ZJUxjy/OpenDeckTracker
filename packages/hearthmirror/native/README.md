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

## Features

- **Process / module discovery** — opens Hearthstone and locates `mono-2.0-bdwgc.dll`.
- **Mono runtime walking** — reads `MonoDomain → MonoAssembly → MonoImage → MonoClass → MonoVTable → static_field_data` to reach app objects.
- **Reflection collectors** — 12 exported methods (account info, decklists, collection, brawl, mercenaries, etc.).
- **Offset probing** — `OffsetProber` (`src/mono/probe.rs`) disassembles Mono accessor exports
  (`mono_class_get_name`, `mono_image_get_name`, etc.) using `iced-x86`, extracts field
  displacements, and validates them against the JSON baseline in
  `config/mono-offsets/unity-2021.3.json`. Probes with displacements outside the
  per-field "sane range" fall back to the baseline (range gating, see
  [add-hearthmirror-offset-probing/design.md](../../../openspec/changes/add-hearthmirror-offset-probing/design.md))
  to stay robust against profiled-thunk garbage in BDWGC Mono builds.
