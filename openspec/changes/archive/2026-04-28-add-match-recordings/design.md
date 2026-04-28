## Context

HDT.js now has three pieces that make match recording practical:

- `@hdt/hearthwatcher` emits typed `PowerEvent` values from `Power.log`.
- `HearthWatcherGameState` and `reducePowerEvent()` can maintain entity card IDs, zones, controllers, hidden state, and conservative origin metadata.
- The Electron main process already hosts HearthWatcher and routes events through `hearthwatcher-host.ts` before broadcasting them to the renderer.

The missing slice is durable per-game history. `power-match-recorder.ts` records a small completed-match summary for Stats, but it intentionally discards the detailed event stream. This design adds a separate recording subsystem that preserves raw events and derives a compact timeline suitable for later inspection UI.

No new external dependency is required. Storage uses Node filesystem APIs under Electron `app.getPath('userData')`.

Target structure:

```text
apps/desktop/src/main/
  match-recording-recorder.ts
  match-recording-recorder.test.ts
  match-recording-store.ts
  match-recording-store.test.ts
  match-recordings-ipc.ts
  match-recordings-ipc.test.ts

packages/core/src/recordings/
  match-recording.ts
  match-recording.test.ts
  timeline-deriver.ts
  timeline-deriver.test.ts
```

If the implementation finds the timeline derivation depends too heavily on Electron-owned state, it may keep the first version in `apps/desktop/src/main/`; pure types should still remain importable without Electron APIs.

## Goals / Non-Goals

**Goals:**

- Persist one durable recording per Hearthstone game observed by HearthWatcher.
- Preserve raw `PowerEvent` values so future code can re-project recordings when timeline rules improve.
- Derive a first-pass timeline containing starting hand, post-mulligan hand, local draws, card plays, public opponent reveals, shuffle events, turn boundaries where available, and completion.
- Expose completed recordings through main-process-owned list/detail IPC.
- Keep unrevealed opponent hand/deck identities hidden in both summaries and detailed recordings.
- Keep tests fixture-driven and independent of a running Hearthstone process.

**Non-Goals:**

- No replay UI, animation timeline, or renderer route in this change.
- No Hearthstone rules simulation, damage validation, random outcome reconstruction, or board-state playback engine.
- No cloud sync, export/import, compression, retention policy UI, or manual editing.
- No attempt to infer hidden opponent identities or generated-card source chains beyond public log events.
- No replacement of the existing match history stats database.

## Decisions

### D1. Use Event-Sourced Recording Files

**Context:** A recording must retain enough information to answer questions that the first implementation may not yet derive, such as "which action caused this entity to appear?"

**Options:**

- Store only final snapshots and derived timeline rows.
- Store only raw Power.log text.
- Store structured raw events plus derived summary/timeline.

**Choice:** Store structured raw `PowerEvent` values plus a derived metadata/initial-state/timeline document.

**Rationale:** Raw events preserve future reprocessing ability without binding the format to the current timeline rules. Derived sections make first-load listing and detail views cheap and stable. Raw text is less useful than typed events because parser behavior is already covered by HearthWatcher tests.

### D2. Store Recordings as Files Under `userData`

**Context:** Match history stats already uses a queryable store, but recordings are append-heavy documents with potentially many raw events.

**Options:**

- Store everything in SQLite tables.
- Store one JSON file per recording.
- Store one metadata JSON file plus one raw-event JSONL file per recording.

**Choice:** Use one directory per recording containing `recording.json` and `events.jsonl`.

**Rationale:** JSONL supports append-on-event with low memory pressure and easy crash recovery. `recording.json` can be atomically rewritten at checkpoints and completion. This avoids designing relational tables for a format that will likely evolve.

Example:

```text
<userData>/match-recordings/
  2026-04-28T06-22-11.123Z_8f3b1c/
    recording.json
    events.jsonl
```

### D3. Keep Recording in the Main Process

**Context:** HearthWatcher runs in the Electron main process and games can finish while renderer windows are closed or reloading.

**Options:**

- Record from renderer `hearthwatcher:event` subscriptions.
- Record inside `@hdt/hearthwatcher`.
- Record in desktop main process beside `power-match-recorder`.

**Choice:** Add a desktop main-process recorder wired from `hearthwatcher-host.ts`.

**Rationale:** Main process sees all events before broadcast, can access latest deck tracker snapshots and app storage paths, and keeps filesystem writes out of the renderer. `@hdt/hearthwatcher` remains a reusable parser/watcher package rather than an app storage owner.

### D4. Derive Timeline Conservatively

**Context:** The user wants starting hand, per-turn actions, and draws. Full semantic reconstruction is not required and would be fragile.

**Options:**

- Interpret every `BLOCK_START` type into high-level game actions.
- Record only low-level events and defer timeline derivation.
- Derive a small set of high-confidence timeline event kinds and keep raw events for the rest.

**Choice:** Derive only high-confidence timeline events:

- `game-started`
- `starting-hand`
- `post-mulligan-hand`
- `turn-start`
- `draw`
- `play-card`
- `opponent-reveal`
- `shuffle-deck`
- `game-completed`

**Rationale:** Zone transitions and public reveal events are reliable enough for useful inspection. Ambiguous or unsupported blocks remain available through `rawEventRefs` for future enrichment.

### D5. Privacy Guard Is Part of the Recording Contract

**Context:** Power.log includes hidden opponent entities without card IDs. Future reducers could accidentally copy card IDs once revealed or infer identity from later state.

**Options:**

- Store reducer entities as-is and trust callers.
- Strip opponent entities entirely.
- Store hidden opponent entities with entity ID, zone, controller, and hidden flag only until public reveal.

**Choice:** Persist hidden opponent hand/deck entities without card IDs and expose only public card IDs after `SHOW_ENTITY` / `CHANGE_ENTITY` reveals.

**Rationale:** This matches existing deck tracker privacy behavior and keeps recordings useful for public events without leaking information the user could not know during the match.

### D6. IPC Is Read-Only for First Delivery

**Context:** The first delivery needs stored recordings to be accessible later, but does not need a management UI.

**Options:**

- Add only internal storage and no IPC.
- Add list/detail read IPC.
- Add read, delete, export, import, and retention IPC.

**Choice:** Add list/detail read IPC only.

**Rationale:** It makes the capability testable and usable by later UI without expanding scope into file management policy.

## Risks / Trade-offs

- **[Power.log format or timing differences]** -> Preserve raw events and keep derived timeline conservative; add fixture tests around real event sequences.
- **[Crash during recording]** -> Append raw events to JSONL as they arrive and periodically rewrite `recording.json`; incomplete recordings remain marked `status: "in-progress"` and are hidden from normal completed lists unless explicitly requested later.
- **[Large files for long games]** -> Store compact typed event JSONL, not full UI snapshots. A future retention/compression change can operate on per-recording directories.
- **[Incorrect draw/action inference]** -> Timeline events include entity IDs, source event indices, and confidence-limited kinds so future reprocessing can correct them.
- **[Privacy regression]** -> Add tests that hidden opponent hand/deck entities never expose card IDs in persisted recording files or IPC responses.
- **[Storage path compatibility]** -> Main process owns path resolution through Electron `app.getPath('userData')`; tests use explicit temp directories.

## Migration Plan

1. Add pure recording types and timeline derivation helpers with fixture tests.
2. Add main-process file store that creates recording directories, appends events, writes summaries, lists completed recordings, and loads details.
3. Add `MatchRecordingRecorder` that handles `create-game`, applies `reducePowerEvent`, derives timeline checkpoints, and finalizes on game completion.
4. Wire the recorder into `hearthwatcher-host.ts` beside the existing stats match recorder.
5. Add read-only IPC/preload methods for listing completed recordings and loading one recording.
6. Run desktop main/preload tests plus `@hdt/core` recording tests.

Rollback: remove the recorder wiring from `hearthwatcher-host.ts`. Existing recording files can remain under `userData` without affecting tracking or stats.

## Open Questions

- Should incomplete recordings be exposed through IPC for debugging, or kept internal until a later developer tool?
- Should the initial implementation include a small renderer developer panel, or leave UI entirely to a follow-up change?
- Should recording IDs be deterministic fingerprints or generated IDs with metadata-based duplicate detection?
