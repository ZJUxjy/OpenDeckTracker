# Spike 0003: HearthMirror Reflection Runtime Validation

## Background

[`add-hearthmirror-reflection-methods`](../../openspec/changes/add-hearthmirror-reflection-methods/) upgraded 12 `IReflection` method stubs to real Mono memory traversal implementations. However, all verification was done **without a running Hearthstone process** — unit tests use mocks, integration tests skip via `skip_if_no_hs`.

This spike validates those implementations against a real Hearthstone process to answer:

1. How many of the 12 methods return non-empty data?
2. Which methods fail, and at what point in the chain (class lookup / field resolution / value read)?
3. Are the hardcoded Mono structure offsets (`MONO_CLASS_NAME=0x2C`, etc.) still valid?
4. Have any C# field names changed in the current Hearthstone build?

Initiated by [`verify-hearthmirror-on-real-hs`](../../openspec/changes/verify-hearthmirror-on-real-hs/).

## Methodology

1. **Tool**: `cargo run --example dump_reflection` from `packages/hearthmirror/native/`
   - Connects to running Hearthstone via existing `MonoRuntime::init()`
   - Calls all 12 reflection methods independently (each wrapped in match, no early abort)
   - Outputs JSON Lines to stdout: `{method, status, value, error, elapsed_ms}`

2. **Automation**: `scripts/run-hearthmirror-spike.ps1`
   - Runs the cargo example
   - Collects environment info (OS build, HS version, mono dll SHA1)
   - Formats output as Markdown table
   - Appends as a new "Run N" section to this report

3. **Tiers**:
   - **Tier 1 (mandatory)**: Main menu + logged in — 8 methods not requiring in-game state
   - **Tier 2 (best-effort)**: In a match — 4 methods requiring game state

## Findings

> To be filled after execution runs.

## Recommendations

> To be filled after findings analysis.

## Environment Matrix Reference

| Field | Value |
|---|---|
| OS | Windows XX build XXXXX |
| Hearthstone version | XX.X.X.XXXXX |
| mono-2.0-bdwgc.dll SHA1 | XXXXXXXX |
| Battle.net region | XX |
| Test date (UTC) | YYYY-MM-DD HH:MM |
| Tester | @username |

> Copy this table for each Run section. Future contributors: add your own environment when running the spike.

## Cross-reference with Previous Spikes

- [Spike 0001](0001-hearthmirror-spike-report.md): Validated napi-rs + windows crate toolchain, cross-architecture memory read, ~252 µs/call.
- [Spike 0002](0002-hearthmirror-mono-spike-report.md): Validated Mono runtime location, PE export parsing, `mono_get_root_domain` pattern matching, offset probing need identified.
- **This spike (0003)**: Validates the full reflection chain end-to-end — class lookup → singleton resolution → field traversal → value extraction.