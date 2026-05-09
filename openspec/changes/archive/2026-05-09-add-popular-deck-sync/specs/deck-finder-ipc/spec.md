## MODIFIED Requirements

### Requirement: popular-decks IPC handler

The desktop main process SHALL register an IPC handler for the
channel `popular-decks:list` that returns
`{ decks: readonly PopularDeckEnriched[], source: 'synced' | 'seed', fetchedAt: string | null }`.

`decks` is the popular-deck list enriched with derived
`manaCurve: readonly number[]` and
`keyCards: readonly { name: string; count: number; cost: number }[]`
fields per entry. The enrichment uses
`computeManaCurve` / `computeKeyCards` from
`apps/desktop/src/main/popular-decks-derived.ts` against the loaded
CardDb.

The data source MUST be:

1. If a valid synced snapshot exists at
   `<userData>/popular-decks/synced.json` (per the
   `popular-deck-sync` capability's persistence requirement), use
   its `decks` array, set `source: 'synced'`, and set `fetchedAt`
   to the snapshot's `fetchedAt`.
2. Otherwise (cache absent / malformed / schemaVersion mismatch /
   empty), fall back to `POPULAR_DECKS_SEED` from
   `@hdt/core/deck/popular-decks-seed.ts`, set `source: 'seed'`, and
   set `fetchedAt: null`.

The handler MUST be a synchronous-style invoke (`ipcMain.handle`)
returning the object directly. It MUST NOT mutate the seed. If the
CardDb is not yet available (early app boot), the handler MUST
return entries with empty `manaCurve = [0,0,0,0,0,0,0,0]` and
`keyCards = []` rather than rejecting; the renderer treats this as
a "still indexing" state.

When a sync completes successfully (signal received from the
`popular-deck-sync` capability), the next invocation of
`popular-decks:list` MUST observe the updated cache; no in-process
caching MAY hide the new data.

The handler MUST be registered from the `apps/desktop/src/main/ipc.ts`
top-level `registerIpc(...)` function (or a sibling module called
from there) so it loads alongside the existing card / decks /
match-history handlers.

#### Scenario: Handler returns synced data when cache is valid

- **GIVEN** `<userData>/popular-decks/synced.json` is valid and
  contains 30 entries with `fetchedAt: '2026-05-09T12:00:00Z'`
- **WHEN** the renderer invokes `popular-decks:list`
- **THEN** the resolved object has `source: 'synced'`,
  `fetchedAt: '2026-05-09T12:00:00Z'`, and `decks.length === 30`

#### Scenario: Handler falls back to seed when cache is absent

- **GIVEN** no `synced.json` file exists
- **WHEN** the renderer invokes `popular-decks:list`
- **THEN** the resolved object has `source: 'seed'`,
  `fetchedAt: null`, and `decks` matches `POPULAR_DECKS_SEED` shape
  (same length, same `id` values in order)

#### Scenario: Handler reflects fresh cache after sync

- **GIVEN** the handler was invoked once and returned seed data
- **WHEN** a sync completes and writes a new `synced.json`
- **AND** the handler is invoked again
- **THEN** the second response has `source: 'synced'` and reflects
  the new snapshot's `fetchedAt`

#### Scenario: Repeated calls do not mutate the seed

- **WHEN** the channel is invoked twice with no synced cache and
  the second result's `decks` is compared field-by-field against
  `POPULAR_DECKS_SEED`
- **THEN** every entry matches exactly

### Requirement: Preload exposes window.hdt.popularDecks

The desktop preload SHALL expose
`window.hdt.popularDecks.list(): Promise<{ decks: PopularDeckEnriched[], source: 'synced' | 'seed', fetchedAt: string | null }>`
which forwards to the `popular-decks:list` IPC channel. The
`PopularDeckEnriched` type extends `PopularDeck` with the derived
`manaCurve` and `keyCards` fields documented above.

The new namespace MUST sit alongside `window.hdt.decks` (saved
decks) without overlap. The namespace MUST be exported as part of
the existing `HdtApi` shape so renderer typings auto-update via the
preload `typeof api` re-export.

#### Scenario: Renderer-visible API shape

- **WHEN** the renderer imports `HdtApi` from the preload module
- **THEN** the type contains `popularDecks.list` returning
  `Promise<{ decks: PopularDeckEnriched[]; source: 'synced' | 'seed'; fetchedAt: string | null }>`
- **AND** the type contains `decks` (existing namespace) unchanged
