### Requirement: Set rotation metadata is exported from `@hdt/hearthdb`

`@hdt/hearthdb` SHALL export, from `packages/hearthdb/src/set-meta.ts`,
two values that drive Standard/Wild grouping and human-readable set
labels:

- `STANDARD_SET_CODES: readonly string[]` — the exact set codes that
  belong to the current Standard rotation. The list MUST be sorted
  oldest-first within Standard so callers can reason about ordering.
- `SET_LABELS: Record<string, { 'en-US': string; 'zh-CN': string }>` —
  display names per set code. Unknown set codes are not in the map;
  callers SHALL fall back to a localized "Unknown set ({code})" string.

The file MUST carry a leading comment block explaining that both
values are hand-curated, point to Blizzard's rotation announcement as
the source, and instruct future maintainers to PR this single file
when a rotation changes.

#### Scenario: STANDARD_SET_CODES is exported

- **WHEN** a consumer imports `STANDARD_SET_CODES` from `@hdt/hearthdb`
- **THEN** it receives a non-empty `readonly string[]` of valid set
  codes (each entry matching `/^[A-Z0-9_]+$/`)

#### Scenario: SET_LABELS covers every Standard set with both locales

- **WHEN** a consumer iterates `STANDARD_SET_CODES`
- **THEN** every entry has a `SET_LABELS[code]['en-US']` and
  `SET_LABELS[code]['zh-CN']` string

### Requirement: Pure set-progress aggregation in `@hdt/core`

`@hdt/core` SHALL export a pure function
`computeSetProgress(allCollectibleCards, ownedByDbfId)` from
`packages/core/src/collection/set-progress.ts` returning
`SetProgress[]`.

`SetProgress` MUST have the shape:

```ts
interface SetProgress {
  setCode: string;
  format: 'standard' | 'wild';
  totalCards: number;     // unique collectible cards in the set
  totalCopies: number;    // legal max copies summed across the set
  ownedCopies: number;    // sum of min(owned, legalMax) per card
  ownedUniqueCards: number; // count of cards with ownedCopies > 0
}
```

The function MUST:

- Skip every input card with `collectible !== true`.
- Group by `card.set` exactly (no normalization).
- For each card, contribute `legalMax = rarity === 'LEGENDARY' ? 1 : 2`
  to `totalCopies`. `rarity === undefined` is treated as a non-legendary
  for cap purposes (legalMax = 2).
- For each card with `dbfId` present in the `ownedByDbfId` map, add
  `min(ownedCount, legalMax)` to `ownedCopies` and increment
  `ownedUniqueCards` if `ownedCount > 0`.
- Mark `format: 'standard'` if and only if `setCode` is in
  `STANDARD_SET_CODES`; otherwise `'wild'`.
- Return rows sorted: standard sets first (preserving the
  `STANDARD_SET_CODES` order), wild sets after (sorted alphabetically
  by setCode).

The function MUST NOT read FS, mutate inputs, or call any IPC.

#### Scenario: Empty owned map yields zero owned counts

- **GIVEN** `allCollectibleCards` contains 245 cards in set `TITANS`
  (legendaries: 23, others: 222)
- **WHEN** `computeSetProgress(allCards, new Map())` runs
- **THEN** the returned row for `TITANS` has
  `totalCards === 245`, `totalCopies === 23 + 222 * 2 === 467`,
  `ownedCopies === 0`, `ownedUniqueCards === 0`

#### Scenario: Owned counts are capped at legal max

- **GIVEN** a card with `rarity: 'COMMON'` and an owned count of 5
- **WHEN** `computeSetProgress` runs
- **THEN** that card contributes 2 (not 5) to its set's `ownedCopies`
- **AND** `ownedUniqueCards` is incremented by 1

#### Scenario: Standard sets sort first

- **GIVEN** `STANDARD_SET_CODES === ['TITANS', 'BADLANDS', 'WHIZBANGS_WORKSHOP']`
  and `allCards` covers two Standard sets and two Wild sets
- **WHEN** `computeSetProgress` runs
- **THEN** the first two returned rows have `format: 'standard'`
  in the `STANDARD_SET_CODES` order
- **AND** the next two rows have `format: 'wild'` sorted by setCode

#### Scenario: Non-collectible cards are skipped

- **GIVEN** the input includes a card with `collectible: false`
- **WHEN** `computeSetProgress` runs
- **THEN** that card does not appear in any `totalCards` /
  `totalCopies` count

### Requirement: Renderer receives set progress over IPC

The desktop main process SHALL register an IPC handler `collection:get-progress` that returns:

```ts
{
  standard: SetProgress[];
  wild: SetProgress[];
  mirrorAlive: boolean;
  source: 'live' | 'cache' | 'empty';
  lastUpdatedAt: number | null;
}
```

The handler MUST:

- Call `cardDb.search({ collectible: true, limit: <large> })` once per invocation (or use a cached collectible-cards list if one exists in main).
- Call `hearthmirror.getCollection()`.
- When live collection returns an array, build the owned map from live data, update the collection snapshot cache, and return `source: 'live'`, `mirrorAlive: true`, and a fresh `lastUpdatedAt`.
- When live collection returns `null` or throws, read the latest collection snapshot cache. If a cache exists, build the owned map from cached data and return `source: 'cache'`, `mirrorAlive: false`, and the cached `lastUpdatedAt`.
- When live collection fails and no cache exists, use an empty owned map and return `source: 'empty'`, `mirrorAlive: false`, and `lastUpdatedAt: null`.
- Feed the selected owned map and all collectible cards into `computeSetProgress`, then split the output into `standard` and `wild` arrays in `format` order.

The preload bridge MUST expose `window.hdt.collection.getProgress(): Promise<CollectionProgressResponse>`.

#### Scenario: Mirror alive returns real owned counts and refreshes cache

- **GIVEN** Hearthstone is running and `getCollection()` returns the user's library
- **WHEN** the renderer calls `collection.getProgress()`
- **THEN** the response has `mirrorAlive: true`, `source: live`, and per-set `ownedCopies` reflecting the user's owned counts
- **AND** the snapshot cache is updated with the returned collection

#### Scenario: Mirror unavailable returns cached counts

- **GIVEN** Hearthstone is not running
- **AND** a previous collection snapshot exists in the cache
- **WHEN** the renderer calls `collection.getProgress()`
- **THEN** the response has `mirrorAlive: false`, `source: cache`, and per-set `ownedCopies` reflecting the cached collection
- **AND** `lastUpdatedAt` is the cache timestamp

#### Scenario: Mirror unavailable without cache returns zero counts and a flag

- **GIVEN** Hearthstone is not running
- **AND** no collection snapshot cache exists
- **WHEN** the renderer calls `collection.getProgress()`
- **THEN** the response has `mirrorAlive: false`, `source: empty`, and every `SetProgress.ownedCopies === 0`
- **AND** `standard` and `wild` arrays are still populated with the correct totals

### Requirement: Collection page renders real per-set progress

`apps/desktop/src/renderer/src/components/Collection.tsx` SHALL consume `collection.getProgress()` and replace every mock per-set number with the real value. The page MUST NOT contain any previous mock arrays.

The page MUST:

- Show a Standard/Wild segmented control. The active format determines which array drives the grid AND the "Overall Progress" bar at the top.
- Render one tile per `SetProgress` row in the active format. Each tile shows: localized set label (`SET_LABELS[code][activeLocale]`, with the `unknownSet` fallback for unknown codes), `ownedUniqueCards / totalCards` cards-collected text, and a progress bar driven by `ownedCopies / totalCopies`.
- Mark a tile as "Complete" only when `ownedCopies === totalCopies`.
- Show a one-line banner above the grid when `mirrorAlive === false`.
- If `source === 'cache'`, the banner MUST indicate cached/stale data and include the localized last-updated timestamp.
- If `source === 'empty'`, the banner MUST indicate that live collection numbers require Hearthstone to be running.
- NOT render the dust chip or the mass-disenchant banner.

All user-visible labels MUST resolve through the active i18n locale.

#### Scenario: Standard tab shows only Standard sets

- **WHEN** the user opens Collection and the Standard tab is active
- **THEN** every rendered tile corresponds to a row with `format: 'standard'`
- **AND** the Wild tab, when clicked, replaces the grid with the `wild` rows

#### Scenario: Cached collection banner appears when live collection is unavailable

- **GIVEN** the IPC returns `mirrorAlive: false`, `source: cache`, and a non-null `lastUpdatedAt`
- **WHEN** the page renders
- **THEN** a localized cached-data banner appears above the grid
- **AND** tiles render cached owned counts rather than zero counts

#### Scenario: Empty collection banner appears when no cache exists

- **GIVEN** the IPC returns `mirrorAlive: false`, `source: empty`, and `lastUpdatedAt: null`
- **WHEN** the page renders
- **THEN** a banner with the localized `collection.progress.mirrorBanner` string appears above the grid
- **AND** all tiles render with `0 / N` cards counts

#### Scenario: Unknown set code falls back to a placeholder label

- **GIVEN** the IPC returns a `SetProgress` row with `setCode: 'NEW2027'` not present in `SET_LABELS`
- **WHEN** the tile renders
- **THEN** its label resolves to the localized "Unknown set (NEW2027)" string from `collection.progress.unknownSet`

#### Scenario: Tile complete state matches owned == total

- **GIVEN** a `SetProgress` row with `ownedCopies === totalCopies`
- **WHEN** the tile renders
- **THEN** the existing "Complete" ribbon is shown
- **WHEN** any other row renders
- **THEN** the ribbon is absent

#### Scenario: All visible labels follow the active locale

- **GIVEN** the active locale is `zh-CN` and a `TITANS` tile is rendered
- **THEN** the label resolves to `SET_LABELS['TITANS']['zh-CN']`
- **AND** the section heading, tab labels, "Complete" ribbon text, and mirror/cache banner render in Chinese
