## Context

HDT.js currently has a working HearthMirror-based tracker path. That path polls memory snapshots and is useful for match metadata, deck selection, and fallback state, but it cannot reconstruct the event history that explains why an entity exists. In practice that means the deck tracker can mistake opponent hero/hero power entities for cards, cannot reliably identify created or stolen copies, and has only approximate handling for Discover, shuffle, transform, and reveal events.

The project direction already identifies HearthWatcher as the primary live game source. This change turns that direction into a bounded implementation: a Node/TypeScript package that tails Hearthstone logs, parses `Power.log`, derives entity state, and feeds the existing core tracker model.

The first supported platform is Windows 10/11 x64. The implementation must run in the Electron main process and must not require renderer APIs, native addons, or direct game memory access.

## Goals / Non-Goals

**Goals:**

- Introduce `packages/hearthwatcher/` as a pure TypeScript workspace package.
- Monitor `Power.log` and minimal loading-screen logs from the Hearthstone log directory.
- Parse core power records into typed events with fixture coverage.
- Maintain a log-derived entity map with controller, zone, card ID, visibility, mulligan, and origin metadata.
- Provide integration hooks so the desktop main process can prefer HearthWatcher events while retaining HearthMirror fallback behavior.
- Surface watcher status and parser diagnostics clearly when logs are unavailable or malformed.

**Non-Goals:**

- Full parity with upstream Hearthstone Deck Tracker's KnownCardIds prediction system.
- Replay UI, statistics persistence, overlay rendering, or deck database workflows.
- Automatic mutation of the user's `log.config`.
- Deep semantic handling for every `BLOCK_START` type, target list, tag, game mode, or Battlegrounds-specific entity.
- Removing HearthMirror.

## Decisions

### D1. Package Boundary

**Context:** Log ingestion has different runtime concerns than memory polling and renderer state.

**Options:**

- Add log parsing directly to `@hdt/core`.
- Add log parsing to the Electron main app.
- Create a new `@hdt/hearthwatcher` package.

**Choice:** Create `packages/hearthwatcher/` and keep it pure Node/TypeScript.

**Rationale:** The package can be tested without Electron, can own file watching and parsing concerns, and can expose typed events to both `@hdt/core` and the desktop app. `@hdt/core` remains the domain model and computation layer.

### D2. File Monitoring Strategy

**Context:** Hearthstone writes logs incrementally and can truncate, rotate, or recreate log files. `fs.watch` alone is unreliable on Windows for this use case.

**Options:**

- Use only `fs.watch`.
- Add an external watcher dependency such as `chokidar`.
- Implement a small polling tailer using Node `fs.promises`.

**Choice:** Implement a polling tailer with offset tracking, partial-line buffering, and rotation/truncation detection.

**Rationale:** Polling every 100-250ms is cheap for a single log file, deterministic in tests, and avoids introducing watcher dependency risk. No new external dependency is required; the current implementation can rely on the Node runtime already bundled with Electron.

**External dependency status:** This design adds no new runtime library. If a future implementation proposes `chokidar`, the implementation must first verify the current maintained version and Electron packaging behavior; this proposal does not depend on it.

### D3. Live Start Offset

**Context:** On app startup, `Power.log` often contains prior games. Replaying old lines by default can create false in-game state.

**Options:**

- Always read from file start.
- Always read from EOF.
- Support both live and replay modes.

**Choice:** Default live mode starts at EOF; test/replay mode can start from the beginning.

**Rationale:** EOF startup avoids stale state in normal desktop use. Beginning startup is still necessary for deterministic fixture tests and future replay/debug tooling.

### D4. Parser and Reducer Separation

**Context:** `Power.log` format parsing and game-state mutation change for different reasons.

**Options:**

- Parse lines and mutate state in one pass.
- Emit typed parser events and let a reducer consume them.

**Choice:** The parser emits typed `PowerEvent` values; a separate reducer owns entity state.

**Rationale:** This keeps regex parsing testable with single-line fixtures and lets reducer tests focus on zone and origin behavior across event sequences. Unknown lines can be ignored by the parser without mutating state.

### D5. Event Scope for First Delivery

**Context:** `Power.log` contains many event shapes. Implementing every semantic detail would make this change too broad.

**Options:**

- Parse only `TAG_CHANGE`.
- Parse every known power event and all block semantics.
- Parse the common entity and tag events, preserving less-used events as typed-but-lightweight records.

**Choice:** Parse `CREATE_GAME`, `FULL_ENTITY`, `SHOW_ENTITY`, `HIDE_ENTITY`, `CHANGE_ENTITY`, `TAG_CHANGE`, `BLOCK_START`, `BLOCK_END`, and `SHUFFLE_DECK`. Reducer behavior is required for entity creation, reveal/change, controller, zone, mulligan, and player tags. `BLOCK_*` is parsed but only minimally interpreted in this change.

**Rationale:** This is enough to solve current deck-tracking origin problems while leaving deep action semantics for later changes.

### D6. Origin Classification

**Context:** The tracker needs to distinguish physical entities, not just card IDs. Generated cards can share a card ID with an original deck card.

**Options:**

- Infer origin only by comparing card ID counts.
- Treat every entity observed in friendly deck/hand as original.
- Snapshot initial original-deck candidates and classify later entities conservatively.

**Choice:** The reducer records entity-level origin metadata. Friendly entities observed during the initial setup/mulligan window and matching the selected original deck are treated as original candidates. Entities introduced later without original-candidate identity are marked `created=true` unless a stronger rule marks them `stolen=true` or keeps them hidden.

**Rationale:** Entity IDs give better signal than card IDs. The first delivery should be conservative: avoid subtracting generated copies from the original deck, but do not claim perfect Discover/source attribution until block-level semantics and prediction rules are implemented.

### D7. Desktop Integration

**Context:** HearthMirror already drives an existing tracker loop and UI. Switching everything at once would increase risk.

**Options:**

- Replace the existing tracker loop immediately.
- Run HearthWatcher only as diagnostics.
- Add HearthWatcher as the preferred event source with HearthMirror fallback.

**Choice:** The Electron main process owns a HearthWatcher host. It starts/stops with the app, exposes watcher status, and feeds log-derived updates into the existing tracker/core state. HearthMirror remains available for match metadata, deck identity, and fallback snapshots.

**Rationale:** This gives the deck tracker better event history while preserving the working memory path during rollout.

## Target Structure

```text
packages/hearthwatcher/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts
    log-file-watcher.ts
    log-line.ts
    log-paths.ts
    log-watcher.ts
    parsers/
      loading-screen-parser.ts
      power-parser.ts
      power-patterns.ts
    state/
      hearthwatcher-game-state.ts
      power-event-reducer.ts
      origin-classifier.ts
    types/
      diagnostics.ts
      loading-screen-events.ts
      power-events.ts
      power-tags.ts
    __tests__/
      fixtures/
        power-basic-game.log
        power-created-card.log
        power-hidden-opponent-card.log
      log-file-watcher.test.ts
      power-parser.test.ts
      power-event-reducer.test.ts
```

Desktop integration should live outside the package, for example:

```text
apps/desktop/src/main/
  hearthwatcher-host.ts
  ipc/hearthwatcher-ipc.ts
```

## Data Flow

```text
Hearthstone Logs
  -> LogFileTailer
  -> LogLine normalization
  -> PowerParser / LoadingScreenParser
  -> PowerEvent stream
  -> PowerEventReducer
  -> @hdt/core Game / Entity state
  -> DeckTracker snapshot / renderer store
```

## Runtime Behavior

- Log discovery checks the standard Windows Hearthstone log locations and accepts an explicit override path for tests and developer builds.
- Live mode starts at EOF and emits a `waiting-for-lines` status until the next append.
- Missing files are not fatal. The watcher retries and emits diagnostics that explain how to enable logs manually.
- The tailer stores byte offsets, preserves incomplete trailing lines, normalizes CRLF/LF, and resets cleanly when file size becomes smaller than the stored offset.
- Parser errors are counted and surfaced as diagnostics; unknown lines are ignored.
- Backpressure is bounded by `maxBytesPerTick` and `maxBufferedLines`; overflow produces a diagnostic rather than unbounded memory growth.

## Risks / Trade-offs

- **Power.log format drift** -> Keep parser fixture coverage focused on real lines and make unknown lines non-fatal.
- **Incorrect origin classification** -> Mark origin conservatively and keep metadata explicit (`created`, `stolen`, `hidden`, `originalZone`, `originalController`) so future block-level rules can refine it.
- **Startup stale logs** -> Start at EOF by default and require explicit replay mode for historical files.
- **Windows file watching edge cases** -> Use polling with offset and truncation handling instead of depending only on OS change notifications.
- **Performance during very large append bursts** -> Bound bytes and lines per tick, then report lag diagnostics.
- **Security/privacy of logs** -> Read only local Hearthstone log files selected by discovery or explicit configuration; do not upload or persist raw log contents in this change.
- **Compatibility with missing log configuration** -> Do not silently write `log.config`; surface a diagnostic with the expected path and missing file names.

## Migration Plan

1. Scaffold `@hdt/hearthwatcher` and add isolated parser/tailer/reducer tests.
2. Integrate the package into the workspace build and typecheck.
3. Add desktop main-process host behind a configuration flag or internal fallback path.
4. Feed log-derived entity updates into `@hdt/core` while retaining HearthMirror polling.
5. Surface watcher diagnostics in the renderer so manual validation can identify missing `Power.log`.
6. After manual validation, make HearthWatcher the default event source for in-game entity updates.

Rollback is straightforward: disable the HearthWatcher host and continue using the existing HearthMirror polling loop.

## Open Questions

- Which renderer surface should show watcher diagnostics first: a developer panel, settings page, or deck tracker status row?
- Should the app offer a guided `log.config` creation flow later, or keep configuration manual to avoid touching game files?
- How much `BLOCK_START` context is needed before implementing a dedicated Discover/source attribution change?
