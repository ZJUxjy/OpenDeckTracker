## MODIFIED Requirements

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
