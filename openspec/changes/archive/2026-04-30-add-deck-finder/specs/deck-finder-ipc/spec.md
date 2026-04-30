## ADDED Requirements

### Requirement: popular-decks IPC handler

The desktop main process SHALL register an IPC handler for the
channel `popular-decks:list` that returns the
`POPULAR_DECKS_SEED` from `@hdt/core/deck/popular-decks-seed.ts`,
enriched with derived `manaCurve: readonly number[]` and
`keyCards: readonly { name: string; count: number; cost: number }[]`
fields per entry. The enrichment uses
`computeManaCurve` / `computeKeyCards` from
`apps/desktop/src/main/popular-decks-derived.ts` against the loaded
CardDb.

The handler MUST be a synchronous-style invoke (`ipcMain.handle`)
returning the array directly. It MUST NOT mutate the seed. If the
CardDb is not yet available (early app boot), the handler MUST
return entries with empty `manaCurve = [0,0,0,0,0,0,0,0]` and
`keyCards = []` rather than rejecting; the renderer treats this as
a "still indexing" state.

The handler MUST be registered from the `apps/desktop/src/main/ipc.ts`
top-level `registerIpc(...)` function (or a sibling module called
from there) so it loads alongside the existing card / decks /
match-history handlers.

#### Scenario: Channel returns the full seed list

- **WHEN** the renderer invokes `popular-decks:list`
- **THEN** the resolved array equals `POPULAR_DECKS_SEED` shape
  (same length, same `id` values in order)

#### Scenario: Repeated calls do not mutate the seed

- **WHEN** the channel is invoked twice and the second result is
  compared field-by-field against `POPULAR_DECKS_SEED`
- **THEN** every entry matches exactly

### Requirement: Preload exposes window.hdt.popularDecks

The desktop preload SHALL expose
`window.hdt.popularDecks.list(): Promise<PopularDeckEnriched[]>` which
forwards to the `popular-decks:list` IPC channel. The
`PopularDeckEnriched` type extends `PopularDeck` with the derived
`manaCurve` and `keyCards` fields documented above.

The new namespace MUST sit alongside `window.hdt.decks` (saved
decks) without overlap. The namespace MUST be exported as part of
the existing `HdtApi` shape so renderer typings auto-update via the
preload `typeof api` re-export.

#### Scenario: Renderer-visible API shape

- **WHEN** the renderer imports `HdtApi` from the preload module
- **THEN** the type contains `popularDecks: { list: () => Promise<PopularDeckEnriched[]> }`
- **AND** the type contains `decks` (existing namespace) unchanged
