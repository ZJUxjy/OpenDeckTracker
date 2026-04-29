## Why

The Collection page was scaffolded with mock data during the Console UI
redesign — every "Festival of Legends 215/245" number, the 14,350 dust
chip, and the "Mass Disenchant Available — 124 cards" banner are
hard-coded. Now that the Console direction is shipped and `@hdt/hearthdb`
+ `hearthmirror.getCollection()` are both available end-to-end, we can
replace the mocks with a real per-set progress view driven by the
user's actual card library.

## What Changes

- **NEW**: `packages/hearthdb/src/set-meta.ts` exporting
  `STANDARD_SET_CODES: readonly string[]` (the current Standard rotation)
  and `SET_LABELS: Record<string, { 'en-US': string; 'zh-CN': string }>`
  (display names for each set code). This is hand-curated, with a CSS
  comment + README note documenting the maintenance burden each rotation.
- **NEW**: `packages/core/src/collection/set-progress.ts` with a pure
  function `computeSetProgress(allCollectibleCards, ownedCollection)`
  that returns `SetProgress[]`. Each `SetProgress` row has:
  `setCode`, `format` (`'standard' | 'wild'`), `totalCards` (unique
  collectible cards in the set), `totalCopies` (max obtainable copies
  across the set, where each LEGENDARY contributes 1 copy and any other
  rarity contributes 2), `ownedCopies` (sum of owned counts capped per
  card at the legal max), and `ownedUniqueCards`.
- **NEW**: `apps/desktop/src/main/ipc/collection-progress.ts` IPC handler
  `collection:get-progress` that joins the hearthdb collectible card list
  with `hearthmirror.getCollection()` (returning all-zero owned counts
  when the mirror is not alive) and feeds them into `computeSetProgress`.
- **MODIFIED**: `Collection.tsx` consumes the new IPC; replaces all
  mock per-set numbers with real values. The Standard/Wild segmented
  control filters by `format`; the "Overall Progress" bar shows the
  aggregate across whichever format is active. The Expansions grid
  renders one tile per set with locale-aware label, owned-unique /
  total-unique counts, and a progress bar driven by
  `ownedCopies / totalCopies`.
- **REMOVED** from the page (deferred to follow-ups):
  - Dust chip — needs a real dust-pool source we do not have yet.
  - Mass Disenchant CTA — same reason, plus needs disenchant rules.
  - The Database (DB Cards) chip stays — already real today.
- **NEW**: `i18n` keys under `collection.progress.*` and an
  `unknownSet` fallback label for set codes missing from `SET_LABELS`.
- **NEW**: an empty / disconnected state when the mirror is not alive
  (or returns null collection): the page renders the per-set grid with
  zero owned counts and a small banner directing the user to launch
  Hearthstone for live numbers.

Non-goals:
- No dust accounting. The disenchant CTA stays gone until we land
  `add-collection-dust` (wires up dust pool + per-rarity disenchant
  costs).
- No card-level browsing inside a set tile (just the rolled-up
  progress bar). Card-level drill-down is for `add-collection-search`.
- No automatic set-rotation refresh. The Standard list is a
  hand-curated constant; rotations are infrequent and the cost of
  catching them in a maintenance PR is acceptable.
- No mock data behind a flag. We delete the mock arrays outright.

## Capabilities

### New Capabilities
- `collection-progress`: per-set progress aggregation, derived from
  collectible card data + owned collection, exposed to the renderer
  through one IPC and rendered on the Collection page.

### Modified Capabilities
<!-- The Console tokens spec already covers Collection.tsx as in-scope
     for token utilities. No spec changes required there. The
     `hearthmirror-ipc` spec already documents `getCollection`; we are
     a downstream consumer, not modifying that contract. -->

## Impact

- `packages/hearthdb/src/set-meta.ts` (new), exported via
  `packages/hearthdb/src/index.ts`.
- `packages/core/src/collection/set-progress.ts` (new), exported via
  `packages/core/src/index.ts`.
- `apps/desktop/src/main/ipc/` — new `collection-progress.ts` handler
  + registration in the main process IPC bootstrap.
- `apps/desktop/src/preload/index.ts` — new `collection.getProgress()`
  bridge.
- `apps/desktop/src/renderer/src/components/Collection.tsx` — replaced
  body, mock data deleted.
- `resources/locales/en-US.json`, `resources/locales/zh-CN.json` —
  new `collection.progress.*` keys + curated set display names.
- No changes to Hearthstone-mirror native code, deck stores, or any
  other capability.
