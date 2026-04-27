## 1. Package Scaffold

- [x] 1.1 Add `packages/hearthwatcher/package.json`, `packages/hearthwatcher/tsconfig.json`, and `packages/hearthwatcher/vitest.config.ts`; run `pnpm --filter @hdt/hearthwatcher typecheck` and expect TypeScript to compile an empty package without errors.
- [x] 1.2 Add `packages/hearthwatcher/src/index.ts` exporting `createHearthWatcher`, parser types, reducer types, and diagnostics placeholders; run `pnpm --filter @hdt/hearthwatcher typecheck` and expect exit code 0.
- [x] 1.3 Update root workspace/package references only if required for pnpm to discover `@hdt/hearthwatcher`; run `pnpm list --filter @hdt/hearthwatcher --depth 0` and expect the package to be listed.
- [x] 1.4 Commit scaffold with `git commit -m "feat: scaffold hearthwatcher package"` after verifying only intended scaffold files are staged.

## 2. Fixture-First Parser Tests

- [x] 2.1 Add `packages/hearthwatcher/src/__tests__/fixtures/power-basic-game.log` containing real-shape lines for `CREATE_GAME`, `FULL_ENTITY`, and `TAG_CHANGE Entity=64 tag=ZONE value=HAND`.
- [x] 2.2 Add `packages/hearthwatcher/src/__tests__/power-parser.test.ts` with tests asserting `parsePowerLine()` returns `CreateGame`, `FullEntity`, and `TagChange` events from the fixture lines; run `pnpm --filter @hdt/hearthwatcher test -- power-parser` and expect these tests to fail because the parser is not implemented yet.
- [x] 2.3 Implement `packages/hearthwatcher/src/types/power-events.ts`, `packages/hearthwatcher/src/types/power-tags.ts`, `packages/hearthwatcher/src/log-line.ts`, and `packages/hearthwatcher/src/parsers/power-parser.ts` with minimal regex support for the failing tests; rerun `pnpm --filter @hdt/hearthwatcher test -- power-parser` and expect pass.
- [x] 2.4 Extend `power-parser.test.ts` with actual assertions for `SHOW_ENTITY`, `HIDE_ENTITY`, `CHANGE_ENTITY`, `BLOCK_START`, `BLOCK_END`, and `SHUFFLE_DECK` fixture lines; run the same test command and expect failures for unsupported records.
- [x] 2.5 Extend `power-parser.ts` and `power-patterns.ts` to parse the additional records; rerun `pnpm --filter @hdt/hearthwatcher test -- power-parser` and expect all parser tests to pass.
- [x] 2.6 Add malformed-line and unknown-line tests to `power-parser.test.ts`; expected behavior is no event for both, parser diagnostic increment only for malformed supported records; run `pnpm --filter @hdt/hearthwatcher test -- power-parser` and expect pass.
- [x] 2.7 Commit parser work with `git commit -m "feat: parse hearthstone power log events"`.

## 3. Log Discovery and Tailer

- [x] 3.1 Add `packages/hearthwatcher/src/__tests__/log-file-watcher.test.ts` with a temp-file test where live mode starts at EOF and only emits appended lines; run `pnpm --filter @hdt/hearthwatcher test -- log-file-watcher` and expect failure.
- [x] 3.2 Implement `packages/hearthwatcher/src/log-file-watcher.ts` with `start()`, `stop()`, `readFrom: "end" | "beginning"`, polling interval, byte offset, CRLF/LF normalization, and line callback support; rerun the tailer test and expect pass.
- [x] 3.3 Add tailer tests for replay-from-beginning, partial-line buffering, truncation reset, and bounded `maxBytesPerTick`; expected output is exactly one line for a split record and a truncation diagnostic when file size shrinks.
- [x] 3.4 Extend `log-file-watcher.ts` and add `packages/hearthwatcher/src/types/diagnostics.ts` until all tailer tests pass with `pnpm --filter @hdt/hearthwatcher test -- log-file-watcher`.
- [x] 3.5 Add `packages/hearthwatcher/src/log-paths.ts` and tests for explicit override path, standard Windows log path discovery, and missing-log diagnostics; run `pnpm --filter @hdt/hearthwatcher test -- log-paths` and expect pass.
- [x] 3.6 Commit tailer and discovery work with `git commit -m "feat: tail hearthstone log files"`.

## 4. Loading Screen Parser

- [x] 4.1 Add `packages/hearthwatcher/src/__tests__/loading-screen-parser.test.ts` with fixture lines for entering and leaving a game scene; run `pnpm --filter @hdt/hearthwatcher test -- loading-screen-parser` and expect failure.
- [x] 4.2 Implement `packages/hearthwatcher/src/types/loading-screen-events.ts` and `packages/hearthwatcher/src/parsers/loading-screen-parser.ts`; rerun `pnpm --filter @hdt/hearthwatcher test -- loading-screen-parser` and expect pass.
- [x] 4.3 Export loading-screen parser APIs from `packages/hearthwatcher/src/index.ts`; run `pnpm --filter @hdt/hearthwatcher typecheck` and expect exit code 0.
- [x] 4.4 Commit loading-screen parser with `git commit -m "feat: parse hearthstone loading screen state"`.

## 5. Power Event Reducer and Origin Classification

- [x] 5.1 Add `packages/hearthwatcher/src/__tests__/power-event-reducer.test.ts` with a failing test that `FullEntity` creates an entity with card ID, controller, and zone.
- [x] 5.2 Implement `packages/hearthwatcher/src/state/hearthwatcher-game-state.ts` and `packages/hearthwatcher/src/state/power-event-reducer.ts`; run `pnpm --filter @hdt/hearthwatcher test -- power-event-reducer` and expect the `FullEntity` test to pass.
- [x] 5.3 Add reducer tests for `ShowEntity` and `ChangeEntity` revealing a hidden entity's card ID; expected state has the revealed card ID and `info.hidden !== true`.
- [x] 5.4 Add reducer tests for `TAG_CHANGE` zone and controller updates; expected state projections move the entity from `DECK` to `HAND`.
- [x] 5.5 Add reducer tests for hidden opponent hand/deck entities; expected entity card ID remains empty and `info.hidden === true`.
- [x] 5.6 Add `packages/hearthwatcher/src/state/origin-classifier.ts` and tests for initial original-deck assignment using a known original deck list; expected original candidates get `originalController`, `originalZone`, and `created !== true`.
- [x] 5.7 Add origin tests for later generated same-card copies; expected later entity with same card ID is classified by entity ID with `info.created === true`.
- [x] 5.8 Rerun `pnpm --filter @hdt/hearthwatcher test -- power-event-reducer` and expect all reducer/origin tests to pass.
- [x] 5.9 Commit reducer work with `git commit -m "feat: reduce power log events into entity state"`.

## 6. Core Integration

- [x] 6.1 Add failing tests in `packages/core/src/tracker/deck-tracker.test.ts` or a new focused core test file for applying log-derived entity metadata to `Game.entities`; expected state preserves `created`, `hidden`, `originalController`, and `originalZone`.
- [x] 6.2 Implement the minimal `@hdt/core` adapter or method needed to apply log-derived entity updates without importing parser code into core; run `pnpm --filter @hdt/core test` and expect pass.
- [x] 6.3 Add a failing `computeRemaining` test where a seen friendly generated `Fireball` has `info.created === true`; expected remaining original `Fireball` count stays unchanged.
- [x] 6.4 Adjust `computeRemaining` only if the existing behavior does not already satisfy the created-card scenario; rerun `pnpm --filter @hdt/core test` and expect pass.
- [x] 6.5 Add opponent-card tracking tests excluding hero and hero-power card IDs while keeping a normal opponent played minion/spell; run `pnpm --filter @hdt/core test` and expect pass.
- [x] 6.6 Commit core integration with `git commit -m "feat: ingest log-derived tracker entities"`.

## 7. Watcher Orchestration

- [x] 7.1 Add `packages/hearthwatcher/src/log-watcher.ts` and `packages/hearthwatcher/src/__tests__/log-watcher.test.ts` wiring tailer lines through parsers into an event stream; expected test uses fixture lines and receives typed events in order.
- [x] 7.2 Implement watcher lifecycle status events for `ready`, `waiting-for-lines`, `missing-log`, `parser-error`, and `lag`; run `pnpm --filter @hdt/hearthwatcher test -- log-watcher` and expect pass.
- [x] 7.3 Ensure `createHearthWatcher()` is exported from `packages/hearthwatcher/src/index.ts`; run `pnpm --filter @hdt/hearthwatcher typecheck` and expect pass.
- [x] 7.4 Commit watcher orchestration with `git commit -m "feat: orchestrate hearthwatcher event stream"`.

## 8. Desktop Main Process Integration

- [x] 8.1 Add failing unit tests or integration tests for `apps/desktop/src/main/hearthwatcher-host.ts` showing the host starts HearthWatcher and forwards status updates.
- [x] 8.2 Implement `apps/desktop/src/main/hearthwatcher-host.ts` and any required IPC boundary file such as `apps/desktop/src/main/ipc/hearthwatcher-ipc.ts`; expected behavior is main-process owned watcher lifecycle.
- [x] 8.3 Wire watcher status into the preload/renderer store surface already used for tracker status; run the desktop typecheck command used by the repo and expect pass.
- [x] 8.4 Keep HearthMirror fallback active when HearthWatcher reports missing log; add a test or manual test note showing tracker services do not fail when `Power.log` is absent.
- [x] 8.5 Commit desktop integration with `git commit -m "feat: connect hearthwatcher to desktop tracker"`.

## 9. Validation and Manual Test

- [x] 9.1 Run `pnpm --filter @hdt/hearthwatcher test`, `pnpm --filter @hdt/hearthwatcher typecheck`, and `pnpm --filter @hdt/core test`; expected output is all tests passing.
- [x] 9.2 Run the repo-wide typecheck/test commands documented in `package.json`; expected output is no TypeScript or Vitest failures unrelated to pre-existing dirty worktree changes.
- [x] 9.3 Run `npx openspec validate add-hearthwatcher --strict`; expected output is validation success.
- [ ] 9.4 Manually start Hearthstone, enter a match, and verify Dashboard "Watcher" indicator shows `ready` and live events from `Power.log`.
- [ ] 9.5 During manual match validation, play or Discover a card with the same card ID as an original deck card where possible; expected result is the generated entity is not subtracted from the original deck count.
- [ ] 9.6 During manual opponent validation, confirm opponent hero and hero power are not displayed or persisted as opponent cards, while normal opponent played cards are tracked.
- [ ] 9.7 Commit final validation fixes with `git commit -m "test: validate hearthwatcher power log tracking"` if any test-only or validation-fix changes were needed.
