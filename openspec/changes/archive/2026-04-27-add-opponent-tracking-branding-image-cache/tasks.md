## 1. Opponent Tracking Core Tests

- [x] 1.1 Add `OpponentCardRecord`/snapshot expectation tests in `packages/core/src/tracker/deck-tracker.test.ts`; test code: create a fake match where `state.boardState.opposing` contains `{ entityId: 20, cardId: 'CS2_029', zonePosition: 1, attack: 0, health: 0, damage: 0 }`, run `advanceTicks(4)`, and expect `tracker.getSnapshot().opponent.revealed[0]?.cardId` to be `'CS2_029'`; expected `pnpm --filter @hdt/core test deck-tracker` fails before implementation.
- [x] 1.2 Add opponent graveyard regression in `packages/core/src/tracker/deck-tracker.test.ts`; test code: after task 1.1 setup, set `state.boardState = { friendly: [], opposing: [] }`, run `advanceTicks(2)`, and expect `tracker.getSnapshot().opponent.graveyard[0]?.cardId` to be `'CS2_029'`; expected focused core test fails before implementation.
- [x] 1.3 Add hidden opponent data guard test in `packages/core/src/tracker/deck-tracker.test.ts`; test code: set only `opposingHandCount: 5` and `opposingDeckCount: 20`, assert `snapshot.opponent.revealed` and `snapshot.opponent.graveyard` are empty arrays; expected focused core test fails before implementation.
- [x] 1.4 Run `pnpm --filter @hdt/core test deck-tracker`; expected failures mention missing `opponent` snapshot field or empty opponent records.

## 2. Opponent Tracking Core Implementation

- [x] 2.1 Add exported type `OpponentCardRecord` in `packages/core/src/tracker/deck-tracker.ts` with fields `entityId: number`, `cardId: string`, `zone: Zone`, `order: number`; expected `pnpm --filter @hdt/core typecheck` fails until snapshot type is updated.
- [x] 2.2 Extend `DeckTrackerSnapshot` in `packages/core/src/tracker/deck-tracker.ts` with `opponent: { revealed: OpponentCardRecord[]; graveyard: OpponentCardRecord[] }`; expected TypeScript points to `blankSnapshot` and `buildSnapshot` missing fields.
- [x] 2.3 Add private order counter state in `DeckTracker` (`private opponentRecordOrder = 0`) and reset it on match reset in `packages/core/src/tracker/deck-tracker.ts`; expected no behavior change yet.
- [x] 2.4 Update `Game.applyEntitySnapshot` behavior in `packages/core/src/game/game.ts` only if needed so revealed opposing non-deck entities missing from snapshots persist as `GRAVEYARD`; expected existing friendly graveyard tests still pass.
- [x] 2.5 Add helper `buildOpponentRecords(player: Player): { revealed; graveyard }` in `packages/core/src/tracker/deck-tracker.ts` that filters non-empty opponent entities and sorts by stable `order`; expected typecheck passes for helper.
- [x] 2.6 Update `applyEntitySnapshots` in `packages/core/src/tracker/deck-tracker.ts` to feed opposing board entities into `Game` as `PLAY` and preserve known opposing entities when they disappear; expected opponent graveyard test passes after task 2.5.
- [x] 2.7 Update `buildSnapshot` and `blankSnapshot` in `packages/core/src/tracker/deck-tracker.ts` to include `opponent`; expected `pnpm --filter @hdt/core test deck-tracker` passes.
- [x] 2.8 Export `OpponentCardRecord` from `packages/core/src/index.ts`; expected `pnpm --filter @hdt/core typecheck` exits 0.
- [x] 2.9 Run `pnpm --filter @hdt/core test deck-tracker game`; expected all focused core tests pass.
- [x] 2.10 Commit opponent core work with `git add packages/core && git commit -m "feat(core): track revealed opponent cards"`; expected commit succeeds.

## 3. Opponent Sidebar Renderer

- [x] 3.1 Add failing test file `apps/desktop/src/renderer/tests/OpponentCardsPanel.test.tsx`; test code renders `OpponentCardsPanel` with `revealed: [{ entityId: 20, cardId: 'CS2_029', zone: 'PLAY', order: 1 }]` and expects text `Fireball`; expected `pnpm --filter @hdt/desktop test OpponentCardsPanel` fails before component exists.
- [x] 3.2 Add graveyard display test in `apps/desktop/src/renderer/tests/OpponentCardsPanel.test.tsx`; test code renders `graveyard: [{ entityId: 21, cardId: 'CS2_024', zone: 'GRAVEYARD', order: 2 }]` and expects `Frostbolt` under a graveyard section label; expected focused test fails before implementation.
- [x] 3.3 Add empty-state test in `apps/desktop/src/renderer/tests/OpponentCardsPanel.test.tsx`; test code renders empty arrays and expects `No opponent cards revealed`; expected focused test fails before implementation.
- [x] 3.4 Create `apps/desktop/src/renderer/src/components/OpponentCardsPanel.tsx` accepting `revealed` and `graveyard` props of `OpponentCardRecord[]`; expected import errors disappear.
- [x] 3.5 Implement card definition lookup in `OpponentCardsPanel.tsx` using `window.hdt.cards.findById`, with fallback name `cardId`; expected Fireball/Frostbolt tests pass.
- [x] 3.6 Group duplicate opponent records by `cardId` within each section and show counts; expected add a test with two `CS2_029` records and see `x2`.
- [x] 3.7 Wire `OpponentCardsPanel` into `apps/desktop/src/renderer/src/routes.tsx` beside `LiveDeckPanel` on the tracker route; expected dashboard route renders local and opponent sidebars on desktop width.
- [x] 3.8 Wire `OpponentCardsPanel` into `apps/desktop/src/renderer/src/components/OverlayView.tsx`; expected overlay shows opponent sidebar without mock cards.
- [x] 3.9 Add route-level regression in `apps/desktop/src/renderer/tests/dashboard.test.tsx` using store snapshot with opponent `CS2_029`; expected screen contains opponent `Fireball`.
- [x] 3.10 Run `pnpm --filter @hdt/desktop test OpponentCardsPanel dashboard LiveDeckPanel`; expected all focused renderer tests pass.
- [x] 3.11 Commit opponent sidebar work with `git add apps/desktop/src/renderer packages/core/src/index.ts && git commit -m "feat(desktop): show opponent revealed cards sidebar"`; expected commit succeeds.

## 4. Card Image Cache Tests

- [x] 4.1 Add `apps/desktop/src/main/card-image-cache.test.ts` with test code creating a temp cache root, calling `cardImageCachePath({ root, locale: 'zhCN', size: '256x', cardId: 'CS2_029' })`, and expecting the result stays inside root and ends with `zhCN/256x/CS2_029.png`; expected `pnpm --filter @hdt/desktop test card-image-cache` fails before implementation.
- [x] 4.2 Add path traversal rejection test in `apps/desktop/src/main/card-image-cache.test.ts`; test code calls resolver with `cardId: '../secret'` and expects rejection or thrown error containing `invalid cardId`; expected focused test fails before implementation.
- [x] 4.3 Add lazy download cache-hit test in `apps/desktop/src/main/card-image-cache.test.ts`; test code stubs fetch, calls `ensureCardImageCached('CS2_029')` twice, expects fetch called once and both calls return the same local URL; expected focused test fails before implementation.
- [x] 4.4 Add fallback locale test in `apps/desktop/src/main/card-image-cache.test.ts`; test code stubs first fetch 404 for zhCN and second fetch 200 for enUS, expects returned metadata locale `enUS`; expected focused test fails before implementation.
- [x] 4.5 Run `pnpm --filter @hdt/desktop test card-image-cache`; expected failures identify missing `card-image-cache` module.

## 5. Card Image Cache Implementation

- [x] 5.1 Create `apps/desktop/src/main/card-image-cache.ts` with pure path helpers and cardId validation regex `^[A-Za-z0-9_]+$`; expected path tests pass.
- [x] 5.2 Implement `ensureCardImageCached(cardId, options)` in `apps/desktop/src/main/card-image-cache.ts` using built-in `fetch`, `fs.promises`, and atomic temp-file write; expected lazy download test passes.
- [x] 5.3 Add primary/fallback URL builder in `apps/desktop/src/main/card-image-cache.ts` matching current `https://art.hearthstonejson.com/v1/render/latest/{locale}/256x/{cardId}.png`; expected fallback locale test passes.
- [x] 5.4 Register controlled image serving in `apps/desktop/src/main/ipc.ts` or a new main-process protocol handler; expected renderer can request cached images without raw absolute file paths.
- [x] 5.5 Expose `window.hdt.cardImages.get(cardId)` in `apps/desktop/src/preload/index.ts`; expected `apps/desktop/src/renderer/tests/setup.ts` includes a test stub.
- [x] 5.6 Update `apps/desktop/src/renderer/src/hooks/use-card-image-url.ts` to call `window.hdt.cardImages.get(cardId)` and fall back to remote URLs on failure; expected existing `use-card-image-url` tests need updating.
- [x] 5.7 Update `apps/desktop/src/renderer/tests/use-card-image-url.test.ts` to assert cached URL is used when preload API resolves; expected focused test passes.
- [x] 5.8 Update `apps/desktop/src/renderer/tests/CardImagePopover.test.tsx` for cached image source behavior; expected focused popover test passes.
- [x] 5.9 Run `pnpm --filter @hdt/desktop test card-image-cache use-card-image-url CardImagePopover`; expected all focused image cache tests pass.

## 6. Card Image Pre-download Script

- [x] 6.1 Add failing test `scripts/download-card-images.test.ts`; test code writes a small generated card JSON fixture with `CS2_029`, runs exported downloader against a temp cache root with mocked fetch, and expects one downloaded file; expected `pnpm exec vitest run scripts/download-card-images.test.ts` fails before implementation.
- [x] 6.2 Implement `scripts/download-card-images.ts` exporting `downloadCardImagesForTest(options)` and CLI `main()`; expected script test loads module.
- [x] 6.3 Reuse cache path/url helpers from `apps/desktop/src/main/card-image-cache.ts` or move shared pure helpers into `scripts/card-image-cache-shared.ts`; expected no duplicated URL/path rules.
- [x] 6.4 Add root script `"cards:images": "tsx scripts/download-card-images.ts"` in `package.json`; expected `pnpm cards:images --help` exits 0.
- [x] 6.5 Add skip-existing and force-mode tests in `scripts/download-card-images.test.ts`; expected skipped/downloaded counts match.
- [x] 6.6 Run `pnpm exec vitest run scripts/download-card-images.test.ts`; expected script tests pass.
- [x] 6.7 Commit card image cache work with `git add apps/desktop/src/main apps/desktop/src/preload apps/desktop/src/renderer/src/hooks apps/desktop/src/renderer/tests scripts package.json && git commit -m "feat(desktop): cache card images locally"`; expected commit succeeds.

## 7. OpenDeckTracker Branding

- [x] 7.1 Add failing branding regression test in `apps/desktop/src/renderer/tests/App.test.tsx`; test code expects `OpenDeckTracker` and expects `queryByText(/FIRESTONE|Fireplace/)` to be null; expected focused test fails before rename.
- [x] 7.2 Update `apps/desktop/src/renderer/index.html` title to `OpenDeckTracker`; expected test can inspect document title if applicable.
- [x] 7.3 Update app shell/sidebar/header visible labels in `apps/desktop/src/renderer/src` from legacy branding to `OpenDeckTracker`; expected branding test passes.
- [x] 7.4 Update root `package.json` name/description where user-facing to `opendecktracker` / `OpenDeckTracker`; expected `pnpm typecheck` unaffected.
- [x] 7.5 Update `apps/desktop/package.json` product description metadata if present; expected no package script changes break.
- [x] 7.6 Update `README.md` and docs references to use `OpenDeckTracker`; expected `rg -n "FIRESTONE|Fireplace" README.md apps/desktop/src/renderer/src apps/desktop/src/renderer/tests` returns no user-facing product labels.
- [x] 7.7 Update `apps/desktop/src/renderer/tests/App.test.tsx`, `header.test.tsx`, and any snapshot-like assertions for new brand; expected focused renderer tests pass.
- [x] 7.8 Run `pnpm --filter @hdt/desktop test App header dashboard`; expected all focused branding tests pass.
- [x] 7.9 Commit branding work with `git add package.json README.md apps/desktop && git commit -m "refactor(desktop): rename app to OpenDeckTracker"`; expected commit succeeds.

## 8. Integration Validation and Closeout

- [x] 8.1 Run `pnpm --filter @hdt/core test`; expected all core tests pass.
- [x] 8.2 Run `pnpm --filter @hdt/desktop test`; expected all desktop tests pass.
- [x] 8.3 Run `pnpm test`; expected all Vitest suites pass.
- [x] 8.4 Run `pnpm typecheck`; expected all workspace TypeScript projects pass.
- [x] 8.5 Run `openspec validate add-opponent-tracking-branding-image-cache --strict`; expected change is valid.
- [x] 8.6 Manually start `pnpm dev`; expected no-game state shows no mock opponent cards and app shell says `OpenDeckTracker`. **VERIFIED.**
- [x] 8.7 In a real match, play until opponent reveals at least one card; expected opponent sidebar records that card and moves it to graveyard after it leaves play if observable. **VERIFIED.**
- [x] 8.8 Hover any local or opponent card row twice; expected first hover downloads or resolves image and second hover uses local cache. **VERIFIED.**
- [x] 8.9 Update `openspec/changes/add-opponent-tracking-branding-image-cache/tasks.md` checkboxes for completed implementation tasks; expected `openspec list` shows the change complete.
- [x] 8.10 Commit OpenSpec closeout with `git add openspec/changes/add-opponent-tracking-branding-image-cache && git commit -m "docs(openspec): finalize opponent tracking image cache plan"`; expected commit succeeds.
