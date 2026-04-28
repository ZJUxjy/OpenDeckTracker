# hearthmirror-native integration tests

The `tests/integration_*.rs` files are gated behind `cfg(feature = "integration")`
and run against a real Hearthstone process. They are **not** part of the default
`cargo test` cycle because they require:

1. A running `Hearthstone.exe` instance (32-bit Windows process).
2. The user to be logged in and the client to be at the main menu (or whatever
   state the specific test calls out).

## How to run

```bash
cargo test -p hearthmirror-native --features integration
```

Add `-- --ignored` to also run tests marked `#[ignore]` (manual / interactive
recovery procedures).

## Files

| File | Trigger | Purpose |
|---|---|---|
| `integration_runtime_init.rs` | auto under `--features integration` | Sanity-check that `MonoRuntime::init()` succeeds against the live HS pe-read window (regression for `add-hearthmirror-pe-read-cap-fix`). |
| `integration_reflection.rs` | auto under `--features integration` | Exercise the 12 reflection methods against live Hearthstone (used during spike Run 8+). |
| `integration_image_walking.rs` | auto under `--features integration` | Validate `MonoImage` class-cache hashtable walking against live HS (regression for `add-hearthmirror-image-walking`). |
| `integration_runtime_recovery.rs` | `--ignored` only | **Manual recovery test** — `add-hearthmirror-runtime-recovery`. Walks the operator through start / kill / restart Hearthstone and asserts the staleness probe + re-init flow works at every step. See the file's module-level docs for the full procedure. |

## Manual recovery test

The `live_recovery_round_trip` test in `integration_runtime_recovery.rs` is
the only `#[ignore]`-d integration test. It blocks on stdin between phases so
the operator can perform the manual steps. Run it like this:

```powershell
cargo test -p hearthmirror-native --features integration -- `
    --ignored --nocapture live_recovery_round_trip
```

Findings should be recorded as a new `## Run N` section in
`docs/spikes/0003-hearthmirror-reflection-runtime-validation.md`.
