## Context

`apps/desktop/src/renderer/src/components/Collection.tsx` is the last
page in the Console direction still rendering mock data. The shape of
the mock — Standard/Wild tabs, four sets per tab, percent-complete bar,
dust chip, mass-disenchant CTA — defines the Console page layout but
the numbers are fictional.

The data we need to make this real is split across two sources:

- **Card metadata.** `@hdt/hearthdb` already loads `Cards.json` and
  serves `cards.search()` over IPC. Each `CardDef` carries `set`
  (string code), `rarity`, `collectible`. Combined, this is enough to
  enumerate every collectible card in every set and to compute the
  legal max copies per set.
- **Owned counts.** `hearthmirror.getCollection()` returns
  `CollectionCard[]` with `dbfId` + `count` + `premium`. The mirror is
  alive only when Hearthstone is running and a memory snapshot is
  available; the renderer must degrade to "not connected" gracefully.

What is **not** available:

- Set rotation. Hearthstone's Standard rotation is governed by Blizzard;
  there is no machine-readable signal in `Cards.json`. Set membership
  in Standard must be hand-coded.
- Dust pool. The mirror does not expose the user's arcane dust balance
  in any reflector we currently load. Dust-aware UI is therefore out
  of scope.
- Card-back / golden-only counts in a way that maps to per-set
  completion. `CollectionCard.premium` is a 0/1/2 flag (normal /
  golden / signature) and the page does not need it for v1.

## Goals / Non-Goals

**Goals:**
- The Collection page reflects the user's real card library when
  Hearthstone is running, and a deterministic zero-state when it is not.
- Aggregation logic lives in `@hdt/core` as a pure function so it can
  be unit-tested without spinning up Electron or the mirror.
- Standard vs Wild grouping is a single line of metadata in
  `@hdt/hearthdb` so future rotation maintenance is one well-known file.

**Non-Goals:**
- No dust accounting (deferred to `add-collection-dust`).
- No card-level grid inside a set tile (deferred to `add-collection-search`).
- No persisted snapshot of the collection across runs — every page
  open re-reads the mirror. (Caching is a follow-up.)

## Decisions

### D1 — Where set rotation metadata lives

**Context.** The Standard set list is a moving target. Adding a
runtime IPC for it would suggest the data is dynamic; baking it into
`@hdt/hearthdb` makes the source of truth obvious.

**Options.**
1. Hard-code the list inside `Collection.tsx`.
2. Put it in `@hdt/core` as a domain constant.
3. Put it in `@hdt/hearthdb` next to `card-defs.ts`.

**Choice.** Option 3 — `packages/hearthdb/src/set-meta.ts`.

**Rationale.** Card metadata, set codes, and rotation status are all
features of the Hearthstone card database snapshot. Co-locating set
rotation with the rest of the card-data layer means a future
auto-generated `set-meta.ts` (sourced from a hsdata feed) drops into
the same package without changing imports elsewhere. `@hdt/core` is
for game/match/deck logic; rotation lookup is data, not logic.

### D2 — Pure aggregation in core, IPC join in main

**Context.** We need to combine two data sources (card library +
owned counts) and produce per-set rollups. The renderer should not
talk to either source directly; the main process is the only place
where both are loaded.

**Choice.**
- `computeSetProgress(allCards, ownedByDbfId)` is a pure function in
  `@hdt/core`. Inputs are plain arrays and a `Map<number, number>`.
  No IPC, no FS, no mirror. 100% covered by unit tests.
- `apps/desktop/src/main/ipc/collection-progress.ts` reads
  `cardDb.search({ collectible: true })`, calls
  `hearthmirror.getCollection()` (catching errors → empty map), and
  feeds both into `computeSetProgress`.
- The renderer calls one IPC: `collection.getProgress()`, returning
  `{ standard: SetProgress[]; wild: SetProgress[]; mirrorAlive: boolean }`.

**Rationale.** Mirrors the existing pattern from match-history-stats:
core owns the math, main owns the source-joining, renderer renders.

### D3 — Owned-copies cap

**Context.** A user can technically own more copies than the legal
max (e.g. duplicates from packs before crafting). The progress bar
must not exceed 100%.

**Choice.** `ownedCopies` for a card = `min(rawCount, legalMax)`,
where `legalMax = rarity === 'LEGENDARY' ? 1 : 2`. We sum the capped
values into per-set totals.

**Rationale.** Matches the in-game collection screen; the user's
mental model of "completion" is "have at least one (legendary) /
two (other) copies of every collectible in this set". Reporting >100%
would be confusing.

### D4 — Set display labels

**Context.** Set codes are opaque (`EXPERT1`, `TITANS`,
`WHIZBANGS_WORKSHOP`). The mock UI used the marketing names
("Festival of Legends", "TITANS", etc.).

**Choice.** Hand-curated `SET_LABELS: Record<string, {'en-US':
string; 'zh-CN': string}>` in `set-meta.ts`. Set codes not in the
map fall back to the raw code prefixed with the i18n
`collection.progress.unknownSet` lead-in (e.g. "Unknown set
(SOMECODE)"), so a rotation that ships a new set still renders
something rather than crashing.

### D5 — Mirror-not-alive UX

**Context.** A user can open the Collection tab without Hearthstone
running. The page must still render.

**Choice.** When `hearthmirror.getCollection()` returns null or
throws, the IPC handler returns `mirrorAlive: false` and the same
`SetProgress[]` shape with every `ownedCopies = 0`. The renderer
shows a one-line banner ("Launch Hearthstone for live numbers")
above the grid; tiles still render with totals so the user can
preview which sets are in Standard vs Wild.

### D6 — IPC payload size

`Cards.json` has ~3500 collectible cards as of patch 27.2. The
post-aggregation payload is ~50 sets × 4 numbers ≈ 200 ints + set
codes — comfortably under 5 KB. Sending raw card lists is **not**
needed in v1; if a future change does set drill-down, it can call
`cards.search({ set })` for exactly the visible set's cards.

## Risks / Trade-offs

- **Risk:** `STANDARD_SET_CODES` drifts after a rotation and
  Standard/Wild grouping is wrong until someone PRs the file.
  → **Mitigation:** README and inline comment call out the
  maintenance burden. The fallback label keeps unknown sets rendering.
  A future change can wire this to a hsdata-fed JSON file.
- **Risk:** A user has Hearthstone open but the mirror has not
  finished its initial snapshot. The page shows zero owned counts
  briefly.
  → **Mitigation:** the IPC accepts that and returns
  `mirrorAlive: true, ownedCopies all 0`. The component renders the
  banner only when `mirrorAlive === false`. Re-fetching on tab
  re-focus can be a follow-up.
- **Risk:** `getCollection()` is heavy on a fresh mirror call.
  → **Mitigation:** cache the result on the main side per pid; the
  mirror itself is already debounced. v1 doesn't need this.
- **Trade-off:** No dust = no "what's worth disenchanting" CTA. The
  current mock CTA goes away with no replacement; we accept the
  reduced surface for now.
- **Trade-off:** We sum `min(count, legalMax)` rather than `count`.
  Users who own >2 copies of a card don't see a "you have spares"
  signal. That signal belongs to the disenchant story.
