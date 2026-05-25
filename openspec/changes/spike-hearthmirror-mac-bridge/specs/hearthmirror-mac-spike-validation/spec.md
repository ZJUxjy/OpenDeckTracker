## ADDED Requirements

### Requirement: Mac spike must validate ADR 0002 chosen option in 3 real-world scenarios

The change `spike-hearthmirror-mac-bridge` SHALL produce evidence that the Rust + napi-rs + cfg-platform-split architecture chosen by [ADR 0002](../../../../docs/adr/0002-hearthmirror-mac-bridge.md) is viable on real Apple Silicon hardware running macOS 12+. The evidence MUST be in the form of `docs/spikes/0006-hearthmirror-mac-spike-report.md` with verbatim console output for each of the three acceptance scenarios.

The spike MUST be executed on **Apple Silicon** hardware (arm64); the Intel path is explicitly out of scope and SHALL NOT be tested.

> **Note on signing.** The original plan included a "Scenario C: unsigned binary fails" negative test. We removed it after the self-review revealed the test is methodologically unsound — `task_for_pid` checks the *calling* process (Electron), not the loaded `.node` addon, so an Electron host with `cs.debugger` would still succeed even if the addon is unsigned. The signing requirement is instead validated *positively*: Scenario A only passes after `scripts/codesign-mac-spike.sh` runs, and Phase 4 (release packaging) covers the negative path through the formal notarization → install pipeline.

#### Scenario: Hearthstone running + spike binary signed → reads Mach-O magic

- **GIVEN** a freshly built `@hdt/hearthmirror-mac-spike` `.node` binary, ad-hoc signed with `com.apple.security.cs.debugger` entitlement
- **AND** Hearthstone Mac client is running and at the main menu (or any post-launch screen)
- **WHEN** Electron main process starts and triggers `spikeReadMacho()`
- **THEN** main process stdout MUST print a single line matching the regex `\[mac-spike:macho\] OK:.*"pid":\s*\d+.*"baseAddress":\s*"0x[0-9A-Fa-f]+".*"headerHex":\s*"(CF FA ED FE|FE ED FA CF)`
- **AND** the spike report MUST capture this line verbatim
- **AND** Electron main window MUST remain responsive

#### Scenario: Hearthstone not running → graceful failure

- **GIVEN** Hearthstone Mac client is fully closed (no `Hearthstone` process under Activity Monitor)
- **WHEN** Electron main process starts and triggers `spikeReadMacho()`
- **THEN** main process stdout MUST print a line matching the regex `\[mac-spike:macho\] FAIL:.*process not found`
- **AND** the spike report MUST capture this line verbatim
- **AND** Electron main window MUST not crash and MUST remain responsive
- **AND** the failure MUST NOT cascade into other initialization paths

#### Scenario: Window probe returns valid frame and heuristic fullscreen state

- **GIVEN** Hearthstone Mac client is running in **windowed mode** at a known size (e.g. 1920×1080 in a window)
- **WHEN** main process triggers `spikeReadHearthstoneWindow()`
- **THEN** stdout MUST print `[mac-spike:window] OK: { x: <num>, y: <num>, width: 1920, height: 1080, fullscreen: false }` (numbers may differ by ±2 due to titlebar)
- **GIVEN** Hearthstone Mac client is then **maximised to cover the main display** (either via the green traffic-light "fullscreen" gesture or by manually resizing to the display bounds)
- **WHEN** main process triggers `spikeReadHearthstoneWindow()` again
- **THEN** stdout MUST print `[mac-spike:window] OK: { x: 0, y: 0, width: <screen.width>, height: <screen.height>, fullscreen: true }`
- **AND** the spike report MUST capture both lines verbatim
- **AND** the spike report MUST note that `fullscreen: true` here is a **heuristic** (window frame matches main-display bounds within ±4px) — true AX-based detection (`kAXFullScreenAttribute`) is deferred to Phase 1, see ADR 0002.

### Requirement: Spike report SHALL document compatibility tuple

The spike report `docs/spikes/0006-hearthmirror-mac-spike-report.md` SHALL include a "Compatibility Tuple" section listing exact versions of:

- macOS version + build number (e.g. `macOS 14.5 (23F79)`);
- Apple Silicon chip (e.g. `M2 Pro`);
- Hearthstone Mac client build number (e.g. `30.4.4.207866`);
- Hearthstone client locale (en-US / zh-CN);
- Electron version + Node version inside Electron (read at runtime via `process.versions`);
- napi-rs CLI version + `napi` crate version;
- Rust toolchain version (`rustc --version`).

#### Scenario: Compatibility tuple completeness gate

- **WHEN** the spike report is reviewed for archival
- **THEN** the Compatibility Tuple section MUST be present
- **AND** every listed value MUST be a concrete string (not `<TBD>` or empty)
- **OR** the change MUST NOT be archived

### Requirement: Spike teardown SHALL leave zero residue

After the spike completes, the change SHALL fully remove all temporary code so that subsequent Phase 1 work starts from a clean baseline.

The teardown step MUST delete:

- The entire `packages/hearthmirror-mac-spike/` directory.
- The Spike trigger block in `apps/desktop/src/main/index.ts` (delimited by `// === SPIKE TRIGGER` and `// === END SPIKE`).
- The `"@hdt/hearthmirror-mac-spike": "workspace:*"` line in `apps/desktop/package.json`'s `devDependencies`.
- The `scripts/codesign-mac-spike.sh` helper (or move it to `scripts/archive/` if it's deemed reusable for Phase 1).
- Any spike-specific entries in `eslint.config.js` ignore lists.
- Any TypeScript declaration files for the spike module.
- Any spike-only entries that landed in `pnpm-lock.yaml` (re-running `pnpm install` after deletion is sufficient).

The teardown step MUST NOT delete:

- `docs/spikes/0006-hearthmirror-mac-spike.md` (spike plan, persistent).
- `docs/spikes/0006-hearthmirror-mac-spike-report.md` (spike outcome, persistent).
- `docs/adr/0002-hearthmirror-mac-bridge.md` (ADR, persistent; Status MUST be upgraded to `Validated`).

#### Scenario: Zero-residue grep gate

- **WHEN** teardown completes
- **AND** the change runs `rg -i 'hearthmirror-mac-spike|spikeRead(Macho|HearthstoneWindow)' --glob '!docs/**' --glob '!openspec/**' .` from the repo root
- **THEN** the command MUST exit non-zero with no matches printed
- **OR** the change MUST NOT be archived

### Requirement: ADR 0002 status upgrade gate

The spike SHALL upgrade `docs/adr/0002-hearthmirror-mac-bridge.md` from `Status: Accepted (...)` to `Status: Validated (<date>)` only if all three acceptance scenarios pass.

If scenario A fails (cannot read Mach-O magic at all), the spike MUST NOT upgrade ADR 0002, MUST file a new ADR 0003 documenting the fallback decision (option B: HSTracker HearthMirror dylib), and MUST update `openspec/changes/.NEXT.md` with the revised next step.

If the windowed-mode part of scenario D passes but the heuristic-fullscreen part is unreliable on the spike machine (e.g. notch padding or scaled display defeats the ±4px tolerance), the spike MAY still upgrade ADR 0002 to `Validated`, but MUST file a follow-up change `investigate-mac-fullscreen-detection` and reference it in the ADR's Consequences section.

#### Scenario: All-pass upgrade

- **GIVEN** scenarios A, B, D all printed expected output
- **WHEN** the spike author updates ADR 0002
- **THEN** the file's first frontmatter line MUST read `> **Status**: Validated (<YYYY-MM-DD>)`
- **AND** a "### Validation" subsection MUST be appended to Consequences linking the spike report
- **AND** `openspec/changes/.NEXT.md` MUST mark this change as ✓ and set next = `refactor-hearthmirror-platform-traits`

#### Scenario: Heuristic fullscreen flake

- **GIVEN** A and B passed but the heuristic-fullscreen check in D was unreliable on the spike machine
- **WHEN** the spike author writes the report
- **THEN** ADR 0002 Status MAY still be upgraded to `Validated`
- **AND** a follow-up change `investigate-mac-fullscreen-detection` MUST be filed under `openspec/changes/`
- **AND** `.NEXT.md` MUST list this follow-up alongside `refactor-hearthmirror-platform-traits`

#### Scenario: Scenario A failure (hard fail)

- **GIVEN** scenario A failed (cannot read Mach-O magic, or napi-rs binary cannot be loaded by Electron)
- **WHEN** the spike author writes the report
- **THEN** ADR 0002 MUST NOT be upgraded
- **AND** a new `docs/adr/0003-hearthmirror-mac-fallback-bridge.md` MUST be created documenting the rationale for switching to option B
- **AND** the macOS roadmap MUST be marked as blocked pending ADR 0003 review
