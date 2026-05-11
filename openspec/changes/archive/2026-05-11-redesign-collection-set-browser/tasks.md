## 1. Rarity → dust / max-copies utility

- [x] 1.1 Create `packages/core/src/collection/dust.test.ts` with tests `maxCopiesForRarity caps legendaries at 1` (asserting return 1 for `LEGENDARY` and 2 for `COMMON`/`RARE`/`EPIC`/`FREE`) and `dustValueForRarity returns standard disenchant values` (asserting 40/100/400/1600 for `COMMON`/`RARE`/`EPIC`/`LEGENDARY` and 0 for `FREE`); run `pnpm --filter @hdt/core exec vitest run src/collection/dust.test.ts` and expect failure (module does not exist).
- [x] 1.2 Create `packages/core/src/collection/dust.ts` exporting `maxCopiesForRarity(rarity: Rarity): number` and `dustValueForRarity(rarity: Rarity): number`; rerun 1.1 and expect both tests to pass.
- [x] 1.3 Add `export * from './collection/dust'` (or equivalent re-export) to `packages/core/src/index.ts` so the desktop renderer can import via `@hdt/core`. Run `pnpm --filter @hdt/core typecheck` and expect exit 0.
- [x] 1.4 Commit with `git add packages/core/src/collection/dust.ts packages/core/src/collection/dust.test.ts packages/core/src/index.ts && git commit -m "feat(core): add rarity to dust and max copies helpers"`; expected output includes a new commit hash.

## 2. SetTile component extraction

- [x] 2.1 Create `apps/desktop/src/renderer/tests/SetTile.test.tsx` with tests:
  - `renders 唯一卡牌 and 总收藏数 stat rows with correct values`
  - `shows Complete badge only when ownedCopies === totalCopies`
  - `applies amber color when ownedCopies is partial`
  - `applies red color when ownedCopies is zero`
  - `shows MINI-SET badge when mini prop is true`
  - `calls onClick with set code when clicked`
  Run `pnpm --filter @hdt/desktop exec vitest run src/renderer/tests/SetTile.test.tsx` and expect failures (component does not exist).
- [x] 2.2 Create `apps/desktop/src/renderer/src/components/SetTile.tsx` exporting a `SetTile` component with prop signature `{ row: SetProgress, label: string, mini: boolean, accent: string, selected?: boolean, onClick: (setCode: string) => void }`; render the art header band (colored, with set name and optional MINI-SET badge), dual-stat info area (`唯一卡牌` + `总收藏数`), thin progress bar, and Complete badge per the spec's "Set Grid uses a 5-column tile layout" requirement. Rerun 2.1 and expect all six tests to pass.
- [x] 2.3 Commit with `git add apps/desktop/src/renderer/src/components/SetTile.tsx apps/desktop/src/renderer/tests/SetTile.test.tsx && git commit -m "feat(renderer): add SetTile component"`; expected output includes a new commit hash.

## 3. Set Grid view (Collection redesign)

- [x] 3.1 Extend `apps/desktop/src/renderer/tests/Collection.progress.test.tsx`:
  - Replace the existing 2-column grid assertion (if any) with `renders set tiles in a 5-column layout` (assert grid container has Tailwind classes for 5 cols at `xl` and falls back at narrower widths; or assert `grid-template-columns` style includes 5 tracks at viewport ≥ `xl`).
  - Add `renders 5 tabs with only the cards tab active`.
  - Add `clicking a disabled tab does not change the active tab`.
  - Add `mode dropdown filters tiles by format`.
  - Add `search filters tiles by localized set name`.
  - Add `clicking a tile sets selectedSetCode`.
  Run `pnpm --filter @hdt/desktop exec vitest run src/renderer/tests/Collection.progress.test.tsx -t "5-column\|5 tabs\|disabled tab\|mode dropdown\|search filters\|clicking a tile"` and expect failures.
- [x] 3.2 Create `apps/desktop/src/renderer/src/components/CollectionSetGrid.tsx` that consumes the `CollectionProgressResponse` plus a callback `onOpenSet(setCode)`. Implement: 5-tab bar (4 disabled with `Coming Soon` chip), mode dropdown + search input filter row, the existing `Standard/Wild` segmented control + overall progress card, the 5-column tile grid using `SetTile`, the existing mirror/cache/empty banner. Rerun 3.1 and expect all new tests to pass.
- [x] 3.3 Refactor `apps/desktop/src/renderer/src/components/Collection.tsx` into a thin container that fetches progress + db stats once, holds `selectedSetCode: string | null` state, and renders `CollectionSetGrid` when null. Keep the existing `useEffect` for `syncFromLive` and the cards-search DB count. Run `pnpm --filter @hdt/desktop exec vitest run src/renderer/tests/Collection.progress.test.tsx` and expect every test (existing + new) to pass.
- [x] 3.4 Commit with `git add apps/desktop/src/renderer/src/components/Collection.tsx apps/desktop/src/renderer/src/components/CollectionSetGrid.tsx apps/desktop/src/renderer/tests/Collection.progress.test.tsx && git commit -m "feat(renderer): switch collection to 5-column set grid with tab bar"`; expected output includes a new commit hash.

## 4. Set Detail page — header

- [x] 4.1 Create `apps/desktop/src/renderer/tests/CollectionSetDetail.test.tsx` with tests:
  - `renders set name, mini badge, and English subtitle in en-US`.
  - `renders 套装已完成 pill only when ownedCopies equals totalCopies`.
  - `back button click invokes onBack`.
  - `renders ownedUniqueCards / totalCards stat in the header`.
  Run `pnpm --filter @hdt/desktop exec vitest run src/renderer/tests/CollectionSetDetail.test.tsx` and expect failures (component does not exist).
- [x] 4.2 Create `apps/desktop/src/renderer/src/components/CollectionSetDetail.tsx` with prop signature `{ setCode: string, row: SetProgress, ownedByDbfId: Map<number, number>, onBack: () => void }`. Implement the detail header per the spec's "Set Detail header" requirement. Leave the filter row and card grid as TODOs/stubs that will be filled in section 6. Rerun 4.1 and expect all four header tests to pass.
- [x] 4.3 Wire `Collection.tsx` to render `CollectionSetDetail` when `selectedSetCode !== null`, passing `onBack: () => setSelectedSetCode(null)`. Run `pnpm --filter @hdt/desktop exec vitest run src/renderer/tests/Collection.progress.test.tsx -t "clicking a tile"` and verify the test passes (it should already render the detail view based on the section 3 implementation).
- [x] 4.4 Commit with `git add apps/desktop/src/renderer/src/components/CollectionSetDetail.tsx apps/desktop/src/renderer/src/components/Collection.tsx apps/desktop/src/renderer/tests/CollectionSetDetail.test.tsx && git commit -m "feat(renderer): add collection set detail header and navigation"`; expected output includes a new commit hash.

## 5. Card cell component

- [x] 5.1 Create `apps/desktop/src/renderer/tests/CollectionCardCell.test.tsx` with tests:
  - `fully owned card renders green badge with no dim overlay`.
  - `partial ownership renders amber badge`.
  - `unowned card renders dim overlay and 未拥有 pill`.
  - `dust chip reads value from dustValueForRarity`.
  - `card image src comes from cardImages.get`.
  - `legendary cards use max=1 from maxCopiesForRarity`.
  Run `pnpm --filter @hdt/desktop exec vitest run src/renderer/tests/CollectionCardCell.test.tsx` and expect failures.
- [x] 5.2 Create `apps/desktop/src/renderer/src/components/CollectionCardCell.tsx` with prop signature `{ card: CardDef, ownedCount: number }`. Use `useEffect` + `window.hdt.cardImages.get` to resolve the image URL on mount; render the image, owned badge with color-coded state, dust chip, and the dim/lock overlay for unowned cards. Rerun 5.1 and expect all six tests to pass.
- [x] 5.3 Commit with `git add apps/desktop/src/renderer/src/components/CollectionCardCell.tsx apps/desktop/src/renderer/tests/CollectionCardCell.test.tsx && git commit -m "feat(renderer): add CollectionCardCell with ownership states"`; expected output includes a new commit hash.

## 6. Set Detail filters + card grid

- [x] 6.1 Extend `apps/desktop/src/renderer/tests/CollectionSetDetail.test.tsx`:
  - `renders 4 filter controls plus mana pill group`.
  - `mana pill 2 filters cells to cost === 2`.
  - `mana pill 7+ filters cells to cost >= 7`.
  - `rarity dropdown filters cells by rarity`.
  - `search filters cells by card name substring (case-insensitive)`.
  - `filters reset when setCode prop changes`.
  - `cards.search is called once with { set, collectible: true } on mount`.
  - `unowned card cells render the dim overlay`.
  Run `pnpm --filter @hdt/desktop exec vitest run src/renderer/tests/CollectionSetDetail.test.tsx -t "filter\|mana\|reset\|search is called\|unowned"` and expect failures.
- [x] 6.2 In `CollectionSetDetail.tsx`, add the filter row (rarity/class/type dropdowns, mana pill group with `全部 + 1..7+`, search input) using local `useState` for each control. Add a `useEffect` keyed on `setCode` that resets all filter state. Call `window.hdt.cards.search({ set: setCode, collectible: true })` once on mount and store the result; combine with `ownedByDbfId` and the filter state to produce the visible card list. Render the 5-column grid of `CollectionCardCell`. Rerun 6.1 and expect all eight tests to pass.
- [x] 6.3 Wire the detail's `ownedByDbfId` map in `Collection.tsx`: derive it from the cached `CollectionProgressResponse` (sum counts per dbfId across all premium tiers) and pass it as a prop. Run `pnpm --filter @hdt/desktop exec vitest run src/renderer/tests/CollectionSetDetail.test.tsx` and expect the whole file to pass.
- [x] 6.4 Commit with `git add apps/desktop/src/renderer/src/components/CollectionSetDetail.tsx apps/desktop/src/renderer/src/components/Collection.tsx apps/desktop/src/renderer/tests/CollectionSetDetail.test.tsx && git commit -m "feat(renderer): add set detail filters and 5-column card grid"`; expected output includes a new commit hash.

## 7. i18n strings

- [x] 7.1 Add the following keys to `resources/locales/en-US.json` and `resources/locales/zh-CN.json` (both files MUST be updated atomically):
  - `collection.tabs.cards` / `cardBacks` / `heroes` / `coins` / `packs`
  - `collection.tabs.comingSoon`
  - `collection.tile.uniqueLabel` (`唯一卡牌` / `Unique`)
  - `collection.tile.copiesLabel` (`总收藏数` / `Total copies`)
  - `collection.tile.miniSet`
  - `collection.tile.complete`
  - `collection.filter.mode.all` / `standard` / `wild`
  - `collection.filter.search`
  - `collection.detail.subtitle` (template with `{english}` and `{total}` placeholders, e.g. `{english} · 共 {total} 张` / `{english} · {total} cards`)
  - `collection.detail.uniqueProgress` (template: `/ {total} 唯一` / `/ {total} unique`)
  - `collection.detail.complete`
  - `collection.detail.filter.rarity.any` / `common` / `rare` / `epic` / `legendary`
  - `collection.detail.filter.class.all`
  - `collection.detail.filter.type.all` / `minion` / `spell` / `weapon` / `location`
  - `collection.detail.filter.mana.all` / `7plus`
  - `collection.detail.filter.search`
  - `collection.card.ownedBadge` (template: `收藏 x{owned}/{max}` / `Owned x{owned}/{max}`)
  - `collection.card.unowned` (`未拥有` / `Not Owned`)
- [x] 7.2 Update `Collection.tsx`, `CollectionSetGrid.tsx`, `CollectionSetDetail.tsx`, `SetTile.tsx`, and `CollectionCardCell.tsx` to resolve every new label through `useTranslation()`. No literal Chinese or English string from the spec MAY remain inline in JSX.
- [x] 7.3 Run `pnpm --filter @hdt/desktop exec vitest run src/renderer/tests/SetTile.test.tsx src/renderer/tests/CollectionSetDetail.test.tsx src/renderer/tests/CollectionCardCell.test.tsx src/renderer/tests/Collection.progress.test.tsx` and expect every test to pass under the default `en-US` locale.
- [x] 7.4 Commit with `git add resources/locales/en-US.json resources/locales/zh-CN.json apps/desktop/src/renderer/src/components/Collection.tsx apps/desktop/src/renderer/src/components/CollectionSetGrid.tsx apps/desktop/src/renderer/src/components/CollectionSetDetail.tsx apps/desktop/src/renderer/src/components/SetTile.tsx apps/desktop/src/renderer/src/components/CollectionCardCell.tsx && git commit -m "feat(renderer): localize collection set browser strings"`; expected output includes a new commit hash.

## 8. Final verification

- [x] 8.1 Run `pnpm --filter @hdt/core typecheck && pnpm --filter @hdt/desktop typecheck`; expect both to exit 0.
- [x] 8.2 Run `pnpm --filter @hdt/core exec vitest run src/collection/`; expect exit 0.
- [x] 8.3 Run `pnpm --filter @hdt/desktop exec vitest run src/renderer/tests/SetTile.test.tsx src/renderer/tests/CollectionSetDetail.test.tsx src/renderer/tests/CollectionCardCell.test.tsx src/renderer/tests/Collection.progress.test.tsx`; expect exit 0.
- [x] 8.4 Run `openspec status --change redesign-collection-set-browser`; expected output shows all artifacts complete and 4/4 ready for archive.
- [x] 8.5 Commit any final test-only fixes with `git commit -m "test(renderer): cover collection set browser redesign"` if files changed; expected output includes a new commit hash or `nothing to commit` if no final changes were needed.
