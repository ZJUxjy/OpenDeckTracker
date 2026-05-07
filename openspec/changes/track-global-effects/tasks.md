## 1. Core domain types & scaffold

- [ ] 1.1 Create directory `packages/core/src/global-effects/` and add an empty placeholder `index.ts` exporting nothing yet — verify with `ls packages/core/src/global-effects` returning the new file.
- [ ] 1.2 Add `packages/core/src/global-effects/types.ts` declaring `GameMode`, `ExpireRule`, `EffectDef<P>`, `ActiveEffect<P>`, `CardPlayedEvent`, `ExtractCtx` per `design.md` §D8 + `specs/global-effects-tracker/spec.md` §"Global effects domain types". Verify with `pnpm --filter @hdt/core typecheck` exiting 0.
- [ ] 1.3 Re-export the four public types from `packages/core/src/global-effects/index.ts` and from `packages/core/src/index.ts` (top-level barrel). Verify with a one-line vitest in `packages/core/src/global-effects/types.test.ts` that imports `EffectDef`, `ActiveEffect`, `GameMode`, `ExpireRule` from `@hdt/core` and asserts `true` — runs green via `pnpm --filter @hdt/core test types`.
- [ ] 1.4 Commit: `feat(core): scaffold global-effects domain types`.

## 2. Catalog barrel + Cleansing Cleric (paramless effect)

- [ ] 2.1 Create failing test `packages/core/src/global-effects/catalog/catalog.test.ts` asserting (a) `EFFECT_CATALOG` is a non-empty `readonly EffectDef[]`, (b) all `id`s pairwise unique, (c) all `sourceCardId`s pairwise unique, (d) every entry has `mode === 'STANDARD'` and `side === 'caster'`. Run: `pnpm --filter @hdt/core test catalog` → expect FAIL (catalog not yet defined).
- [ ] 2.2 Look up Cleansing Cleric's `cardId` in `data/cards/generated/cards.collectible.enUS.json` (search by name) and write it down in this task's commit message.
- [ ] 2.3 Create `packages/core/src/global-effects/catalog/cleansing-cleric.ts` exporting a default `EffectDef` with `id: 'cleansing-cleric'`, `sourceCardId: <id from 2.2>`, `side: 'caster'`, `mode: 'STANDARD'`, no `parameterExtractor`, no `expiresOn`.
- [ ] 2.4 Create `packages/core/src/global-effects/catalog/index.ts` exporting `export const EFFECT_CATALOG: readonly EffectDef[] = [cleansingCleric].sort(...)` (alphabetical by `id`). Re-export from `global-effects/index.ts`.
- [ ] 2.5 Re-run 2.1's test — expect PASS.
- [ ] 2.6 Add test `catalog/hsdata-coverage.test.ts`: load `cards.collectible.enUS.json`, assert each `EFFECT_CATALOG[i].sourceCardId` exists in the collectible pool, AND each STANDARD entry's resolved `set` field is in `STANDARD_SET_CODES` (import from `@hdt/hearthdb`). Run → PASS.
- [ ] 2.7 Commit: `feat(core): add EFFECT_CATALOG with cleansing-cleric`.

## 3. GlobalEffectsRegistry lifecycle

- [ ] 3.1 Create failing test `packages/core/src/global-effects/registry.test.ts` covering all five "Registry lifecycle" scenarios from `specs/global-effects-tracker/spec.md` (ignore unknown card, attribute to caster's side, reset, re-trigger refreshes triggeredAt, snapshot is sorted/JSON-safe). Use a fake `Game`-like object exposing only `localPlayer.controllerId` / `opposingPlayer.controllerId`. Run → FAIL.
- [ ] 3.2 Implement `packages/core/src/global-effects/registry.ts` exporting `class GlobalEffectsRegistry` with fields `private localEffects: Map<string, ActiveEffect>`, `opposingEffects: Map<string, ActiveEffect>`, methods `handleCardPlayed(event)`, `reset()`, `snapshot(): { local: ActiveEffect[]; opposing: ActiveEffect[] }`. Take a `catalogIndex: Map<cardId, EffectDef>` and a `now: () => number` clock as constructor args.
- [ ] 3.3 Re-run 3.1 — expect PASS for all five scenarios.
- [ ] 3.4 Re-export `GlobalEffectsRegistry` from `global-effects/index.ts` and the top-level `@hdt/core` barrel.
- [ ] 3.5 Commit: `feat(core): GlobalEffectsRegistry with per-side handle/reset/snapshot`.

## 4. Tame Pet effect (parameterized, with extractor)

- [ ] 4.1 Capture a real Power.log fragment around a Tame Pet cast — store under `packages/core/src/global-effects/__fixtures__/tame-pet-success.log` (the casting controller plus 3 follow-up beast SHOW_ENTITY events). If a real fixture isn't available yet, hand-craft one matching the actual Power.log format used elsewhere in the repo (cross-check with `packages/hearthwatcher/src/__tests__/fixtures/`).
- [ ] 4.2 Capture / hand-craft a degraded fixture `__fixtures__/tame-pet-truncated.log` (cast event only, no follow-up entities).
- [ ] 4.3 Add failing test `tame-pet.test.ts`: feed each fixture into the to-be-written extractor, expect success → `{ pool: [c1, c2, c3] }` in entity-spawn order; expect truncated → `null`.
- [ ] 4.4 Look up Tame Pet's `cardId` in `cards.collectible.enUS.json`; record it in the commit message.
- [ ] 4.5 Implement `packages/core/src/global-effects/power-log-extractor.ts` with a `readBeastSpawnsAfter(event, ctx, count)` helper that scans HearthWatcher's already-parsed events (do NOT re-parse raw log lines — work off the same event stream the rest of `@hdt/core` consumes); time-window bounded to N events post-cast on the same controllerId.
- [ ] 4.6 Implement `packages/core/src/global-effects/catalog/tame-pet.ts` with `parameterExtractor: async (event, ctx) => { const pool = await readBeastSpawnsAfter(event, ctx, 3); return pool ? { pool } : null; }`.
- [ ] 4.7 Re-run 4.3 — expect PASS.
- [ ] 4.8 Add Tame Pet to the `EFFECT_CATALOG` barrel; verify catalog tests in §2.1/2.6 still pass with the new entry.
- [ ] 4.9 Wire `parameterExtractor` invocation into `GlobalEffectsRegistry.handleCardPlayed`: kick off the promise, store an initial `ActiveEffect` with `params: undefined`, on resolve mutate the entry's `params` in place. Add registry test `re-runs extractor and patches params on resolve`.
- [ ] 4.10 Commit: `feat(core): add tame-pet effect with Power.log parameter extractor`.

## 5. Snapshot integration in DeckTrackerSnapshot

- [ ] 5.1 Failing test `packages/core/src/tracker/deck-tracker.global-effects.test.ts` covering the 3 "DeckTrackerSnapshot conveys per-side global effects" scenarios from `specs/deck-tracker-core/spec.md` (empty arrays in IDLE, propagation during match, drain on IDLE return). Run → FAIL.
- [ ] 5.2 Edit `packages/core/src/tracker/deck-tracker.ts`: add `friendlyEffects: ActiveEffect[]` and `opposingEffects: ActiveEffect[]` to `DeckTrackerSnapshot`; add `private registry: GlobalEffectsRegistry` field; instantiate it in the constructor.
- [ ] 5.3 In `buildSnapshot` (or equivalent assembly site), call `registry.snapshot()` and assign `local` → `friendlyEffects`, `opposing` → `opposingEffects`. Make `blankSnapshot()` set both to `[]`.
- [ ] 5.4 Wire registry.reset to the existing PRE_MATCH→IDLE / fresh-match guards in `DeckTracker`.
- [ ] 5.5 Re-run 5.1 — expect PASS.
- [ ] 5.6 Commit: `feat(core): wire GlobalEffectsRegistry into DeckTracker snapshot`.

## 6. Main-process tracker host wiring

- [ ] 6.1 Failing integration test `apps/desktop/src/main/deck-tracker.global-effects.test.ts` (vitest, mocked `HearthWatcher`): emit a `card:played` for Cleansing Cleric, assert the next snapshot's `friendlyEffects.length === 1` with `id === 'cleansing-cleric'`. Run → FAIL.
- [ ] 6.2 Edit `apps/desktop/src/main/deck-tracker.ts` to forward HearthWatcher's `card:played` events to the tracker's registry. Confirm the existing deck multiset flow is untouched.
- [ ] 6.3 Re-run 6.1 — expect PASS.
- [ ] 6.4 Commit: `feat(desktop): forward card:played to GlobalEffectsRegistry`.

## 7. Renderer Zustand selectors

- [ ] 7.1 Failing test `apps/desktop/src/renderer/tests/deck-tracker-store.effects.test.ts` covering "Selectors return empty arrays for legacy snapshots" and "Selectors are referentially stable" scenarios from `specs/deck-tracker-core/spec.md`. Run → FAIL.
- [ ] 7.2 Edit `apps/desktop/src/renderer/src/stores/deck-tracker-store.ts`: add `useFriendlyEffects` and `useOpposingEffects` hooks using `shallow` equality / a memo over the snapshot reference.
- [ ] 7.3 Re-run 7.1 — expect PASS.
- [ ] 7.4 Commit: `feat(renderer): expose friendly/opposing effects selectors`.

## 8. i18n keys

- [ ] 8.1 Add `globalEffects.tabDeck`, `globalEffects.tabEffects`, `globalEffects.emptyTitle`, `globalEffects.emptyBody` to `resources/locales/en-US.json` and `zh-CN.json`. Pick concise wording (en: "Deck" / "Effects" / "No active global effects" / "Match-wide modifiers triggered by either player will appear here."; zh: "牌库" / "全局效果" / "本局尚未触发全局效果" / "对局中由任意一方打出的全局修正会显示在这里。").
- [ ] 8.2 Add `globalEffects.cleansing-cleric.title` (en: "Cleansing Cleric"; zh: 待确认中文卡名 — 通过 hearthdb `findById(id, 'zh-CN').name`) and `.body` (en: "Healing dealt by the caster's side gains +2 for the rest of the match."; zh equivalent).
- [ ] 8.3 Add `globalEffects.tame-pet.title` and `.body` (zh body: "Animal Companion 召唤池被替换为本场打出 Tame Pet 时随机抽取的 3 张更高费用野兽。" plus en equivalent).
- [ ] 8.4 Add failing test `apps/desktop/src/renderer/tests/locales.global-effects.test.ts`: assert (a) en-US and zh-CN have the same `globalEffects.*` key set; (b) every `EFFECT_CATALOG[i].id` resolves to a non-empty `<id>.title` and `<id>.body` in both locales. Run → expect PASS (since we just added all keys).
- [ ] 8.5 Commit: `feat(renderer): i18n keys for globalEffects namespace`.

## 9. TrackerPanelTabs container

- [ ] 9.1 Failing component test `apps/desktop/src/renderer/tests/TrackerPanelTabs.test.tsx` covering "Default tab is Deck", "Effects badge shows count when non-zero", "Switching tabs preserves deck panel state" (the third uses two `<div data-testid="kept-mounted">` slots whose `useEffect` mount counters are asserted equal across a tab toggle). Run → FAIL.
- [ ] 9.2 Implement `apps/desktop/src/renderer/src/components/TrackerPanelTabs.tsx` per `specs/global-effects-ui/spec.md` §"TrackerPanelTabs container component". Both slots stay mounted; the inactive one is hidden via `hidden` attribute.
- [ ] 9.3 Re-run 9.1 — expect PASS.
- [ ] 9.4 Commit: `feat(renderer): TrackerPanelTabs container`.

## 10. GlobalEffectsPanel + GlobalEffectRow

- [ ] 10.1 Failing component test `apps/desktop/src/renderer/tests/GlobalEffectsPanel.test.tsx` covering all 4 GlobalEffectsPanel scenarios from `specs/global-effects-ui/spec.md` (empty state, Cleansing Cleric without params, Tame Pet with pool, Tame Pet without params). Mock `useCardTileUrl` and `useCardDef` with the same shape used in existing tests (see `OpponentCardsPanel.test.tsx` for pattern). Run → FAIL.
- [ ] 10.2 Implement `apps/desktop/src/renderer/src/components/GlobalEffectRow.tsx` (single row: tile art + title + body + optional params region).
- [ ] 10.3 Implement `apps/desktop/src/renderer/src/components/GlobalEffectsPanel.tsx` (list + empty state + dispatch to GlobalEffectRow). Use `data-testid="global-effect-row"` on each row.
- [ ] 10.4 For Tame Pet's params region: render a horizontal strip of three `<img data-testid="card-row-art">` elements via `useCardTileUrl` for each `params.pool[i]`.
- [ ] 10.5 Re-run 10.1 — expect PASS.
- [ ] 10.6 Commit: `feat(renderer): GlobalEffectsPanel + GlobalEffectRow components`.

## 11. Integrate tabs into routes and overlays

- [ ] 11.1 Failing test `apps/desktop/src/renderer/tests/OverlayView.tabs.test.tsx`: assert the rendered tree contains `data-testid="tracker-tab-deck"` and `data-testid="tracker-tab-effects"`. Run → FAIL.
- [ ] 11.2 Edit `OverlayView.tsx`: wrap `<LiveDeckPanel />` in `<TrackerPanelTabs side='player' deckSlot={...} effectsSlot={<GlobalEffectsPanel effects={useFriendlyEffects()} side='player' />} effectsCount={useFriendlyEffects().length} />`.
- [ ] 11.3 Re-run 11.1 — expect PASS.
- [ ] 11.4 Same pattern in `OpponentOverlayView.tsx` (with `useOpposingEffects()` and `side='opponent'`); add a parallel `OpponentOverlayView.tabs.test.tsx`.
- [ ] 11.5 Same pattern in `routes.tsx` (`RightPanel` wraps both `LiveDeckPanel` and `OpponentCardsPanel` in their own `TrackerPanelTabs`); add a `routes.tracker.tabs.test.tsx` asserting two `TrackerPanelTabs` instances are rendered.
- [ ] 11.6 Commit: `feat(renderer): wire global-effects tabs into tracker routes and overlays`.

## 12. Standard catalog expansion (beyond M1's two cards)

- [ ] 12.1 Walk current Standard sets in `STANDARD_SET_CODES` (in `packages/hearthdb/src/set-meta.ts`) and enumerate cards with persistent global effects (text contains language like "for the rest of the game", "this match", "永久", "本场"). Maintain a working list at `openspec/changes/track-global-effects/standard-effects-catalog.md` — purely scratchpad, not committed.
- [ ] 12.2 For each candidate card not yet in `EFFECT_CATALOG`: (a) add `catalog/<id>.ts`, (b) add i18n title + body in both locales, (c) if parameterized, capture fixtures + extractor + tests as in §4. Commit one card per commit: `feat(core): add <effect-id> global effect`.
- [ ] 12.3 If the catalog grows to ≥10 entries, run a coverage sanity sweep: `pnpm --filter @hdt/core test` should still pass; `pnpm --filter @hdt/desktop test` should still show no new failures beyond the pre-existing sqlite-ABI baseline.

## 13. Final verification

- [ ] 13.1 `pnpm --filter @hdt/core typecheck` exits 0.
- [ ] 13.2 `pnpm --filter @hdt/desktop typecheck` exits 0.
- [ ] 13.3 `pnpm test` — confirm new tests pass and no regressions outside the documented pre-existing baseline (sqlite ABI mismatches; App.i18n zh-CN flake; hearthwatcher log-watcher timing flake).
- [ ] 13.4 Manual smoke (single happy path): launch Hearthstone, start a Standard match, play Cleansing Cleric — verify the player overlay's Effects tab shows `1`, click it, see the row. Same for Tame Pet on a second match (pool may stay empty if Power.log doesn't expose; UI gracefully degrades).
- [ ] 13.5 `openspec validate track-global-effects --strict` exits 0.
- [ ] 13.6 Commit (if any uncommitted housekeeping): `chore: finalize track-global-effects`.
