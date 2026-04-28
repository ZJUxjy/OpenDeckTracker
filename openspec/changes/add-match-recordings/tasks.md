## 1. Core Recording Types and Timeline Derivation

- [x] 1.1 Add failing tests in `packages/core/src/recordings/match-recording.test.ts` for `createEmptyMatchRecording()` returning `status: "in-progress"`, stable `recordingId`, `startedAt`, empty initial state, empty timeline, and empty raw event refs; run `pnpm --filter @hdt/core test -- match-recording` and expect failure because the module does not exist.
- [x] 1.2 Create `packages/core/src/recordings/match-recording.ts` with exported recording metadata, initial-state, timeline, summary, and detail types plus `createEmptyMatchRecording()`; run `pnpm --filter @hdt/core test -- match-recording` and expect pass.
- [x] 1.3 Export recording types/helpers from `packages/core/src/index.ts`; run `pnpm --filter @hdt/core typecheck` and expect exit code 0.
- [x] 1.4 Add failing tests in `packages/core/src/recordings/timeline-deriver.test.ts` asserting local `DECK -> HAND` zone changes produce a `draw` timeline event with `cardId`, `entityId`, `controllerId`, and `sourceEventIndex`; run `pnpm --filter @hdt/core test -- timeline-deriver` and expect failure.
- [x] 1.5 Implement `packages/core/src/recordings/timeline-deriver.ts` draw derivation over previous/current reduced entity state; run `pnpm --filter @hdt/core test -- timeline-deriver` and expect pass.
- [x] 1.6 Extend `timeline-deriver.test.ts` with failing cases for `opponent-reveal`, `shuffle-deck`, `turn-start`, and conservative no-event behavior for unsupported events; run `pnpm --filter @hdt/core test -- timeline-deriver` and expect failure.
- [x] 1.7 Implement the remaining conservative derivation helpers in `timeline-deriver.ts`; run `pnpm --filter @hdt/core test -- timeline-deriver` and expect pass.
- [x] 1.8 Add privacy tests in `timeline-deriver.test.ts` asserting hidden opponent hand/deck entities never expose `cardId`; run `pnpm --filter @hdt/core test -- timeline-deriver` and expect pass after implementation.
- [x] 1.9 Commit core recording domain work with message `feat(core): add match recording timeline domain`.

## 2. Main-Process Recording Store

- [x] 2.1 Add failing tests in `apps/desktop/src/main/match-recording-store.test.ts` using a temp directory to assert `appendRawEvent()` creates `<root>/<recordingId>/events.jsonl`; run `pnpm --filter @hdt/desktop test -- match-recording-store` and expect failure.
- [x] 2.2 Create `apps/desktop/src/main/match-recording-store.ts` with a filesystem-backed store using explicit root directory injection for tests; run `pnpm --filter @hdt/desktop test -- match-recording-store` and expect the append test to pass.
- [x] 2.3 Extend `match-recording-store.test.ts` with failing tests for writing `recording.json`, listing completed summaries newest-first, and excluding in-progress recordings from the default completed list; run `pnpm --filter @hdt/desktop test -- match-recording-store` and expect failure.
- [x] 2.4 Implement summary write/list behavior in `match-recording-store.ts`; run `pnpm --filter @hdt/desktop test -- match-recording-store` and expect pass.
- [x] 2.5 Extend `match-recording-store.test.ts` with failing tests for `loadRecording(id)` returning full detail and returning `null` for a missing ID; run `pnpm --filter @hdt/desktop test -- match-recording-store` and expect failure.
- [x] 2.6 Implement `loadRecording(id)` and JSONL event loading in `match-recording-store.ts`; run `pnpm --filter @hdt/desktop test -- match-recording-store` and expect pass.
- [x] 2.7 Add a malformed-file resilience test in `match-recording-store.test.ts` asserting a bad recording directory is skipped during list and returns `null` on load; run `pnpm --filter @hdt/desktop test -- match-recording-store` and expect pass after implementation.
- [x] 2.8 Commit storage work with message `feat(desktop): add match recording file store`.

## 3. Match Recording Recorder

- [x] 3.1 Add failing tests in `apps/desktop/src/main/match-recording-recorder.test.ts` asserting `create-game` starts an in-progress recording and appends subsequent raw events; run `pnpm --filter @hdt/desktop test -- match-recording-recorder` and expect failure.
- [x] 3.2 Create `apps/desktop/src/main/match-recording-recorder.ts` with `createMatchRecordingRecorder({ store, getSnapshot, now })`; run `pnpm --filter @hdt/desktop test -- match-recording-recorder` and expect initial lifecycle tests to pass.
- [x] 3.3 Extend `match-recording-recorder.test.ts` with failing tests that latest `DeckTrackerSnapshot.deck` populates deck ID, deck name, and original deck counts; run `pnpm --filter @hdt/desktop test -- match-recording-recorder` and expect failure.
- [x] 3.4 Implement snapshot metadata capture in `match-recording-recorder.ts`; run `pnpm --filter @hdt/desktop test -- match-recording-recorder` and expect pass.
- [x] 3.5 Extend `match-recording-recorder.test.ts` with failing tests for starting hand and post-mulligan hand capture from reduced local entities; run `pnpm --filter @hdt/desktop test -- match-recording-recorder` and expect failure.
- [x] 3.6 Implement initial hand and mulligan capture in `match-recording-recorder.ts`; run `pnpm --filter @hdt/desktop test -- match-recording-recorder` and expect pass.
- [x] 3.7 Extend `match-recording-recorder.test.ts` with failing tests for finalizing on `GameEntity STATE=COMPLETE` and `GameEntity STEP=FINAL_GAMEOVER`; run `pnpm --filter @hdt/desktop test -- match-recording-recorder` and expect failure.
- [x] 3.8 Implement completion detection and summary finalization in `match-recording-recorder.ts`; run `pnpm --filter @hdt/desktop test -- match-recording-recorder` and expect pass.
- [x] 3.9 Extend `match-recording-recorder.test.ts` with failing tests that a second `create-game` closes the previous recording as incomplete before starting the next one; run `pnpm --filter @hdt/desktop test -- match-recording-recorder` and expect failure.
- [x] 3.10 Implement incomplete-recording closure in `match-recording-recorder.ts`; run `pnpm --filter @hdt/desktop test -- match-recording-recorder` and expect pass.
- [x] 3.11 Add privacy regression tests in `match-recording-recorder.test.ts` asserting hidden opponent hand/deck cards are persisted without card IDs and revealed opponent cards are persisted after `show-entity`/`change-entity`; run `pnpm --filter @hdt/desktop test -- match-recording-recorder` and expect pass after implementation.
- [x] 3.12 Commit recorder work with message `feat(desktop): record hearthwatcher match events`.

## 4. Desktop Wiring and IPC

- [x] 4.1 Update `apps/desktop/src/main/hearthwatcher-host.test.ts` with a failing expectation that HearthWatcher events are routed through `createMatchRecordingRecorder().handleEvent()` in addition to `createPowerMatchRecorder().handleEvent()`; run `pnpm --filter @hdt/desktop test -- hearthwatcher-host` and expect failure.
- [x] 4.2 Wire `createMatchRecordingRecorder()` into `apps/desktop/src/main/hearthwatcher-host.ts` using `app.getPath('userData')`, `getLatestDeckTrackerSnapshot`, and the file store; run `pnpm --filter @hdt/desktop test -- hearthwatcher-host` and expect pass.
- [x] 4.3 Add failing tests in `apps/desktop/src/main/match-recordings-ipc.test.ts` asserting `recordings:list` returns serializable summaries and `recordings:get` returns detail or `null`; run `pnpm --filter @hdt/desktop test -- match-recordings-ipc` and expect failure.
- [x] 4.4 Create `apps/desktop/src/main/match-recordings-ipc.ts` and register read-only IPC handlers; run `pnpm --filter @hdt/desktop test -- match-recordings-ipc` and expect pass.
- [x] 4.5 Update `apps/desktop/src/main/index.ts` or existing service registration to call the recording IPC registrar; run `pnpm --filter @hdt/desktop typecheck` and expect exit code 0.
- [x] 4.6 Update `apps/desktop/src/preload/index.ts` with `window.hdt.recordings.list()` and `window.hdt.recordings.get(id)`; add failing preload tests in `apps/desktop/src/preload/index.test.ts`; run `pnpm --filter @hdt/desktop test -- index.test` and expect failure.
- [x] 4.7 Implement preload recording API exposure and renderer type declarations in `apps/desktop/src/renderer/src/env.d.ts`; run `pnpm --filter @hdt/desktop test -- index.test` and `pnpm --filter @hdt/desktop typecheck` and expect both pass.
- [x] 4.8 Commit wiring and IPC work with message `feat(desktop): expose match recording reads`.

## 5. Verification and Cleanup

- [x] 5.1 Run `pnpm --filter @hdt/core test -- recordings` and expect all recording domain tests to pass.
- [x] 5.2 Run `pnpm --filter @hdt/desktop test -- match-recording` and expect all recording store/recorder/IPC tests to pass.
- [x] 5.3 Run `pnpm --filter @hdt/desktop test -- hearthwatcher-host index.test` and expect integration/preload tests to pass.
- [x] 5.4 Run `pnpm --filter @hdt/core typecheck` and `pnpm --filter @hdt/desktop typecheck` and expect both exit code 0.
- [x] 5.5 Run `openspec validate add-match-recordings --strict` and expect validation success.
- [x] 5.6 Commit final cleanup with message `test: verify match recording workflow`.
