## Why

The tracker now has HearthWatcher Power.log ingestion and basic match history, but it does not persist the detailed per-match event history needed to inspect what happened during a game. This is the next narrow step after the HearthWatcher work in `DEVELOPMENT_PLAN.md`: keep enough structured match state to support later replay/timeline UI without trying to simulate the game engine.

## What Changes

- Add a match recording subsystem that listens to the existing HearthWatcher `PowerEvent` stream in the Electron main process.
- Persist one recording per game with metadata, initial state, derived timeline events, final summary, and raw Power events for future re-projection.
- Capture starting hand, post-mulligan hand, local draws, card plays, opponent reveals, shuffle events, turn boundaries where available, and game completion.
- Keep hidden opponent hand/deck identities private; unrevealed opponent entities are stored only as hidden/count state.
- Add storage and IPC boundaries for listing completed recordings and loading a single recording by ID.
- Add fixture-driven tests for recorder lifecycle, derived timeline events, privacy guards, and storage read/write behavior.

### Non-goals

- Do not build a full replay player or UI timeline in this change.
- Do not reproduce a real Hearthstone game environment or simulate rules/combat resolution.
- Do not infer unrevealed opponent cards, decklists, secrets, or generated-card sources beyond public Power.log information.
- Do not replace the existing match history stats store; recordings are a separate detailed artifact that may reference stats metadata.
- Do not upload recordings or add cloud sync/export in this change.

## Capabilities

### New Capabilities

- `match-recordings`: Persist detailed per-game recordings derived from HearthWatcher events, expose them through main-process storage and IPC, and protect hidden opponent information.

### Modified Capabilities

- None.

## Impact

- Adds desktop main-process recording code, likely under `apps/desktop/src/main/`.
- Adds recording domain types and pure helpers in `@hdt/core` or a narrow desktop-owned module, depending on implementation fit.
- Extends main/preload IPC with recording list/detail APIs.
- Reuses `@hdt/hearthwatcher` Power events and existing deck tracker snapshots; no new native dependency is expected.
- Adds local filesystem storage under Electron `app.getPath('userData')`, with tests using explicit temporary directories.
