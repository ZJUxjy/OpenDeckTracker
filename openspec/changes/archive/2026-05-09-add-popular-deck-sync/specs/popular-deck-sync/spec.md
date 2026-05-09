## ADDED Requirements

### Requirement: HSGuru fetcher in main process

The desktop main process SHALL contain a module under
`apps/desktop/src/main/popular-decks-sync/` that fetches the
HSGuru legend meta page (`https://www.hsguru.com/meta?rank=legend&sort_by=total`)
and the per-archetype variant pages, parses the HTML, and produces a
list of `PopularDeck` records satisfying the existing `deck-finder`
spec contract (every entry MUST have a decodable `deckstring`, a
`HeroClass` resolvable from the decoded blueprint, and a
`PopularDeckArchetype` derived from the HSGuru archetype label).

The fetcher MUST use Electron's `net.fetch` (not `node-fetch` or
`undici`) and MUST send the same `User-Agent` and `Accept` headers
as the existing `data/hsguru-data-spider/src/fetch-legend-top20.mjs`
spider, so HSGuru's anti-bot heuristics treat it identically.

The fetcher MUST throttle requests with at least a 1-second delay
between archetype variant fetches (matching the spider) so we do
not hammer HSGuru.

The fetcher MUST be cancellable: when the consumer aborts the
operation, the next pending HTTP request MUST NOT be issued and the
in-flight one MUST be aborted via `AbortController`.

#### Scenario: Fetcher returns PopularDeck records compatible with seed shape

- **GIVEN** a successful end-to-end fetch + parse against a fixture
  HSGuru meta+archetype HTML response
- **WHEN** the fetcher resolves
- **THEN** every returned record has the same field set as
  `PopularDeck` declared in `@hdt/core/deck/deck-types.ts`
- **AND** every record's `deckstring` decodes via
  `@hdt/hearthdb`'s `decodeDeck` without throwing

#### Scenario: Fetcher cancels pending requests on abort

- **GIVEN** a sync operation is in progress between archetypes
- **WHEN** the consumer calls `controller.abort()`
- **THEN** no further HTTP requests are issued
- **AND** the fetcher rejects with an `AbortError`

#### Scenario: Fetcher rate-limits archetype fetches

- **GIVEN** N archetypes are being fetched
- **WHEN** N >= 2
- **THEN** the gap between two consecutive archetype fetches is at
  least 1000 ms

### Requirement: HSGuru-to-PopularDeck transformation

The sync module SHALL contain a pure function that maps a single
HSGuru archetype + variant tuple (the raw scraper output shape) to a
`PopularDeck` record. The function MUST:

- Build the `id` as `<archetype-kebab>-<deckId>` (matching the seed
  convention)
- Resolve `class` by decoding the deckstring via `@hdt/hearthdb`'s
  `decodeDeck` and reading the `HeroClass` from the blueprint
- Resolve `format` from the decoded blueprint and map back to the
  `Format` union
- Bucket the HSGuru archetype label into a `PopularDeckArchetype`
  (`'Aggro'|'Midrange'|'Control'|'Combo'|'Tempo'|'Ramp'`) via a
  documented label-to-bucket mapping; unknown labels MUST default to
  `'Midrange'` so the seed contract is never violated
- Set `winratePercent` to the variant's winrate (rounded to 1
  decimal)
- Set `gamesCount` to the variant's `games`
- Set `dustCost` to 0 placeholder; the actual dust cost is derived
  later from the CardDb (the renderer payload already enriches via
  `popular-decks-derived.ts`, but the persisted record carries 0
  until the seed/sync schema is unified)
- Set `author` to `'hsguru'`
- Set `updatedAt` to the snapshot's `fetchedAt` truncated to
  YYYY-MM-DD

#### Scenario: Transformation produces stable id

- **GIVEN** the same archetype + deckId tuple
- **WHEN** the transformer is called twice
- **THEN** both calls produce records with the same `id`

#### Scenario: Unknown archetype label falls back to Midrange

- **GIVEN** an HSGuru archetype label not in the documented mapping
- **WHEN** the transformer runs
- **THEN** the resulting record's `archetype` is `'Midrange'`

#### Scenario: Class is read from the decoded deckstring

- **GIVEN** a Mage deckstring whose HSGuru archetype label happens
  to be malformed
- **WHEN** the transformer runs
- **THEN** the resulting record's `class` is `'MAGE'` (sourced from
  the decode, not the label)

### Requirement: Sync IPC channels

The desktop main process SHALL register three IPC surfaces:

- `popular-decks:sync-start` — `ipcMain.handle`. Triggers a sync if
  none is in flight; returns
  `{ ok: true, fetchedAt: string, count: number } | { ok: false, error: string }`
  Calling while a sync is already in flight MUST return
  `{ ok: false, error: 'already-syncing' }` without queuing a second
  run.
- `popular-decks:sync-status` — `ipcMain.handle`. Returns
  `{ inFlight: boolean, lastFetchedAt: string | null }`. Never
  rejects.
- `popular-decks:sync-progress` — main → renderer event sent via
  `webContents.send`. Each event payload is
  `{ phase: 'meta' | 'variants' | 'transform' | 'persist',
     completed: number, total: number, currentLabel?: string }`.
  The handler MUST emit at least one event per phase and one final
  event with `phase === 'persist'` and `completed === total`.

The preload SHALL expose:

- `window.hdt.popularDecks.syncStart(): Promise<...>`
- `window.hdt.popularDecks.syncStatus(): Promise<...>`
- `window.hdt.popularDecks.onSyncProgress(cb): () => void` —
  registers a listener and returns an unsubscribe function. The
  listener MUST be cleaned up on unmount.

#### Scenario: Concurrent sync-start is rejected

- **GIVEN** a sync is already in flight
- **WHEN** `popular-decks:sync-start` is invoked again
- **THEN** the second invocation resolves with
  `{ ok: false, error: 'already-syncing' }`
- **AND** only one network round-trip set is performed

#### Scenario: Status reports last fetched time after success

- **GIVEN** a sync just completed successfully at time T
- **WHEN** `popular-decks:sync-status` is invoked
- **THEN** the result is `{ inFlight: false, lastFetchedAt: T }`

#### Scenario: Progress events fire for each phase

- **WHEN** a sync runs end-to-end against a fixture
- **THEN** the renderer receives at least one event with each of
  the four phases in order: `meta`, `variants`, `transform`,
  `persist`
- **AND** the final event has `completed === total`

#### Scenario: Unsubscribe stops further callbacks

- **GIVEN** a renderer registered a progress listener and received
  the unsubscribe function
- **WHEN** the renderer calls the unsubscribe function and a new
  sync runs
- **THEN** the listener is not invoked

### Requirement: Synced snapshot persistence

The main process SHALL persist the most recent successful sync
result to `<userData>/popular-decks/synced.json`. The file shape is:

```
{
  "schemaVersion": 1,
  "fetchedAt": "<ISO-8601 string>",
  "decks": PopularDeck[]
}
```

The directory MUST be created if missing. Writes MUST be atomic
(write to `synced.json.tmp` then rename) so a crash mid-write does
not corrupt the cache.

On startup the main process MUST attempt to load `synced.json`. If
the file is absent, malformed JSON, has a `schemaVersion` other than
`1`, or has fewer than one entry, the loader MUST silently treat the
cache as empty (and the `popular-decks:list` handler will fall back
to the bundled seed — see the `deck-finder-ipc` modified spec).

The loader MUST validate every entry against the `PopularDeck`
shape: an entry missing any required field invalidates the entire
cache (the file is treated as empty). This prevents partial
corruption from bleeding into the UI.

#### Scenario: Atomic write survives crash mid-write

- **GIVEN** an existing valid `synced.json`
- **WHEN** a sync writes new data but the process is killed before
  rename completes
- **THEN** on next startup the original `synced.json` is still
  loadable

#### Scenario: Malformed cache falls back silently

- **GIVEN** `<userData>/popular-decks/synced.json` contains invalid
  JSON
- **WHEN** the main process boots
- **THEN** the loader treats the cache as empty (no exception
  surfaces to the user)
- **AND** subsequent `popular-decks:list` invocations return the
  bundled seed

#### Scenario: schemaVersion mismatch falls back

- **GIVEN** an existing cache with `schemaVersion: 2`
- **WHEN** the main process boots
- **THEN** the loader treats the cache as empty

### Requirement: DeckFinderTab sync UI

`DeckFinderTab.tsx` SHALL render a sync control row above the deck
grid containing:

- A "Sync" button (label from i18n key `decks.finder.syncButton`)
- A "Last updated" label (i18n key `decks.finder.lastUpdated` with
  `{date}` interpolation, sourced from the IPC `fetchedAt` field;
  shows "Never" if `null`)
- A determinate progress bar visible only while a sync is in flight

The button MUST be disabled while `inFlight` is true and re-enabled
after the sync resolves (success or failure).

On successful sync the component MUST refetch
`window.hdt.popularDecks.list()` so the deck grid reflects the new
data without a full page reload.

On failure the UI MUST display an error toast (or inline error)
using i18n key `decks.finder.syncError`; the previously-displayed
deck list MUST remain visible (the failure does not wipe the grid).

#### Scenario: Button is disabled during sync

- **GIVEN** a sync is in flight
- **WHEN** the button is rendered
- **THEN** it has the `disabled` attribute

#### Scenario: Last-updated reads from IPC payload

- **GIVEN** the IPC `popular-decks:list` returns
  `{ decks: [...], source: 'synced', fetchedAt: '2026-05-09T...' }`
- **WHEN** the tab renders
- **THEN** the "Last updated" label shows the date from
  `fetchedAt` (formatted per locale)

#### Scenario: Sync failure preserves existing grid

- **GIVEN** the deck grid is already populated
- **WHEN** a sync is started and fails
- **THEN** the deck grid still shows the previously-loaded data
- **AND** an error notification is displayed
