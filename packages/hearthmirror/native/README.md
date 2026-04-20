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

## Class resolution

`MonoRuntime::find_class(image, namespace, name)` does **not** scan a
`class_def_table` heuristic anymore. It walks the embedded
`MonoInternalHashTable` at `MonoImage.class_cache` (offset `+0x35C` per the
JSON baseline) — the same structure Mono itself uses for class lookup:

1. `MonoImage::new(runtime, ac_image_addr)` constructs a thin view over the
   live `MonoImage*` and reads `class_cache.size` + `class_cache.table`
   directly out of the embedded struct (it's *not* a pointer field — see
   `$class_cache_note` in `unity-2021.3.json`).
2. `MonoImage::find_class(namespace, name)` traverses each non-NULL bucket head
   in `class_cache.table[0..size]`, follows the `class.next_class_cache = +0xA0`
   chain, and matches `class.name` + `class.name_space` against the requested
   pair.
3. Class results are cached per-image inside `RuntimeCache`, so the
   hash walk runs once per `(image, namespace, name)` triple per
   `MonoRuntime` instance.

Field reads on a `MonoClass` traverse the inheritance chain via
`MonoClassRef::fields_recursive` / `find_field` (capped at 32 levels of
parents, child fields shadow parent fields with the same name). Each field
exposes a `MonoFieldDef { name, offset, type_ptr, is_static }` view; `is_static`
is decoded from `MonoType.attrs & 0x10`. `MonoObject::find_field(name)` resolves
the object's class via its vtable and delegates to `MonoClassRef::find_field`,
so reflectors get inherited-field lookup without per-collector boilerplate.

See [add-hearthmirror-image-walking/design.md](../../../openspec/changes/add-hearthmirror-image-walking/design.md)
for the full rationale (F-11 fix) and the 3 integration tests in
`tests/integration_image_walking.rs`.
