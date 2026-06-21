## Context

Match recordings currently preserve raw `PowerEvent` records, a reduced entity state, initial hand data, and a conservative timeline in `@hdt/core`. The Electron main process records these events through `apps/desktop/src/main/match-recording-recorder.ts`, persists JSON files through `match-recording-store.ts`, and exposes read-only detail through `recordings:get`.

The next step is to make these recordings useful for analysis and model input. The system needs a deterministic layer that converts public match progress into structured analysis events and Chinese natural-language frames while keeping the raw event stream as the replay source of truth.

## Goals / Non-Goals

**Goals:**

- Derive analysis-ready game progress events from the same public log-derived state used by match recordings.
- Produce deterministic zh-CN narration frames suitable for future LLM prompts.
- Persist the derived analysis/narration data inside match recordings and expose it through existing read-only recording APIs.
- Emit narration frames live as the match progresses, so a future model adapter can consume them without re-reading files.
- Keep hidden opponent information protected.

**Non-Goals:**

- No remote LLM calls, API keys, provider SDKs, embeddings, or prompt execution.
- No full Hearthstone rules simulation.
- No prediction/recommendation engine.
- No replacement of existing raw-event preservation or timeline derivation.
- No broad redesign of the Stats or recording viewer surface.

## Decisions

### Decision 1: Add a pure core projector/narrator layer

**Context:** Recording derivation already lives in `packages/core/src/recordings`, while Electron owns IO and IPC.

**Options:**

- Put narration directly in the Electron recorder.
- Add a pure `@hdt/core` module consumed by the recorder and tests.

**Choice:** Add pure modules under `packages/core/src/recordings/`.

**Rationale:** Core can be unit-tested without Electron, can project both live and replayed recordings, and keeps future consumers from depending on main-process internals.

### Decision 2: Use additive recording fields

**Context:** Existing recordings are JSON files with `recording.json` and `events.jsonl`. Legacy recordings must remain loadable.

**Options:**

- Create a new analysis file per recording.
- Add `analysisEvents` and `narrationFrames` arrays to `recording.json`.

**Choice:** Add optional/additive fields to `recording.json`, normalized to empty arrays on load.

**Rationale:** The first version keeps storage simple, avoids another lookup path, and preserves compatibility because missing fields can be defaulted.

### Decision 3: Narration is deterministic and template-based

**Context:** The output is intended for later LLM analysis, but this change must not call a model.

**Options:**

- Generate prose with a local/remote LLM.
- Use deterministic templates over structured events.

**Choice:** Use deterministic zh-CN templates.

**Rationale:** Template output is testable, stable across replays, cheap, and avoids introducing external dependencies or privacy concerns.

### Decision 4: Card names are resolved by injected lookup

**Context:** `@hdt/core` should stay mostly framework-agnostic, while desktop already loads card definitions and locale data.

**Options:**

- Import a concrete HearthDb card database in the narrator.
- Require callers to pass a `resolveCardName(cardId)` callback.

**Choice:** The narrator accepts a card-name resolver and falls back to the raw card ID.

**Rationale:** This keeps projection pure and lets desktop provide zh-CN display names without coupling core to app startup or filesystem paths.

### Decision 5: Live delivery uses a small main-process narration hub

**Context:** Recording generation already receives every live `PowerEvent`; future LLM integration needs real-time frames.

**Options:**

- Make consumers poll `recordings:get` during a match.
- Broadcast each new narration frame from main to renderer/preload and keep a bounded in-memory recent buffer.

**Choice:** Add a read-only live narration hub in the Electron main process.

**Rationale:** Broadcasting avoids file polling and keeps the live feed usable before a recording is completed. The buffer supports late subscribers without changing the recording store contract.

### Decision 6: No new external dependencies

**Context:** The existing stack already has TypeScript, Vitest, Electron IPC, and HearthDb card data.

**Options:**

- Add a narration/NLP library.
- Implement the first version with existing workspace packages.

**Choice:** Add no external dependencies.

**Rationale:** The needed behavior is deterministic formatting and event projection. Current dependency versions remain the source of truth: Electron `37.2.6`, React `18.3.1`, Vitest `2.1.9`, and existing workspace packages. Avoiding new packages reduces packaging risk for the first release.

## Final File Layout

```text
packages/core/src/recordings/
  match-recording.ts
  timeline-deriver.ts
  game-progress-analysis.ts        # new structured analysis projection
  game-progress-narration.ts       # new deterministic zh-CN narration
  game-progress-analysis.test.ts   # new unit tests
  game-progress-narration.test.ts  # new unit tests

apps/desktop/src/main/
  match-recording-recorder.ts      # append analysis/narration during recording
  match-recording-store.ts         # normalize legacy recordings
  game-progress-narration-host.ts  # new live broadcast/recent-frame hub
  game-progress-narration-host.test.ts

apps/desktop/src/preload/
  index.ts                         # expose read-only live narration subscription/query

apps/desktop/src/renderer/src/components/
  MatchRecordingViewer.tsx         # show analysis narration section
```

## Risks / Trade-offs

- [Risk] Power.log does not expose every game mechanic in a directly readable form → Keep the first event set conservative and source-indexed; unknown mechanics remain raw/timeline-only.
- [Risk] Hidden opponent cards could leak through narration → Narrator MUST only use public `cardId` values and sanitized analysis events; tests cover hidden hand/deck cases.
- [Risk] Duplicate narration frames from repeated projection → Use stable `sequence` plus `sourceEventIndex` and append frames only for newly derived events in the live recorder.
- [Risk] Long games create large narration arrays → Frames are compact text records and recordings already persist raw events; live hub keeps only a bounded recent buffer.
- [Risk] Template phrasing may not be ideal for all future LLM prompts → Keep structured analysis events alongside text so prompt builders can choose either representation.

## Migration Plan

1. Add optional `analysisEvents` and `narrationFrames` fields to `MatchRecording`.
2. Update `createEmptyMatchRecording` to initialize both arrays.
3. Update store load normalization so legacy recordings return empty arrays.
4. Update recorder to append derived analysis/narration for new events and write them into `recording.json`.
5. Add live narration hub and read-only preload surface.
6. Update recording viewer to render a compact narration section.

Rollback is straightforward: old recordings remain readable because raw events and timeline are unchanged. If the new projection fails, the recorder can continue persisting raw events/timeline while returning empty analysis/narration arrays.

## Open Questions

- Which model-facing prompt format should consume these frames later: plain concatenated text, JSONL, or a mixed structured prompt?
- Should English narration be added later for non-zh-CN locales, or should this feed remain Chinese-only for the first model workflow?
