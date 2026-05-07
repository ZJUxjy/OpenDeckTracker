## ADDED Requirements

### Requirement: DeckTrackerSnapshot conveys per-side global effects

`DeckTrackerSnapshot` SHALL gain two new top-level fields (declared in `packages/core/src/tracker/deck-tracker.ts`):

- `friendlyEffects: ActiveEffect[]` — global effects whose caster
  is the local player; empty array when none.
- `opposingEffects: ActiveEffect[]` — global effects whose caster
  is the opposing player; empty array when none.

`ActiveEffect` MUST be the type defined in the
`global-effects-tracker` capability.

The orchestrator (`DeckTracker` class) MUST populate these fields
on every snapshot tick from its host `GlobalEffectsRegistry.snapshot()`.
The fields MUST be present on every emitted snapshot, including
`IDLE`, `PRE_MATCH`, error, and post-match snapshots — empty
arrays when the registry has no entries.

#### Scenario: Empty arrays in IDLE phase

- **GIVEN** a freshly constructed `DeckTracker` in `IDLE`
- **WHEN** `getSnapshot()` is called before any match begins
- **THEN** `snapshot.friendlyEffects` and `snapshot.opposingEffects`
  are both `[]` (not `undefined`)

#### Scenario: Effects propagate to snapshot during a match

- **GIVEN** an active match in which the local player just played
  Cleansing Cleric
- **WHEN** the next snapshot tick fires
- **THEN** `snapshot.friendlyEffects` contains a single entry with
  `id === 'cleansing-cleric'`
- **AND** `snapshot.opposingEffects` is `[]`

#### Scenario: Registry resets between matches drain the snapshot

- **GIVEN** a snapshot from a finished match in which both sides
  had multiple active effects
- **WHEN** the orchestrator transitions to `IDLE` and emits the
  next snapshot
- **THEN** both `friendlyEffects` and `opposingEffects` are `[]`

### Requirement: Renderer Zustand store exposes effects selectors

`apps/desktop/src/renderer/src/stores/deck-tracker-store.ts` SHALL
expose two new memoized selectors:

- `useFriendlyEffects(): ActiveEffect[]` — returns
  `snapshot.friendlyEffects ?? []` (handling missing-field legacy
  snapshots gracefully).
- `useOpposingEffects(): ActiveEffect[]` — returns
  `snapshot.opposingEffects ?? []`.

These selectors MUST coexist with the existing
`useDeckTrackerSnapshot`, `useDeckTrackerPhase`, and
`useDeckTrackerError` selectors without altering their behaviour.

The selectors MUST return referentially stable arrays across
renders when the underlying snapshot has not changed (i.e.,
returning the same array reference when the snapshot reference is
unchanged).

#### Scenario: Selectors return empty arrays for legacy snapshots

- **GIVEN** a snapshot that omits `friendlyEffects` /
  `opposingEffects` entirely (received from an older main-process
  build)
- **WHEN** the selectors run
- **THEN** both return `[]`
- **AND** no exception is thrown

#### Scenario: Selectors are referentially stable

- **GIVEN** two consecutive renders with the same snapshot
  reference and a non-empty `friendlyEffects` array
- **WHEN** `useFriendlyEffects()` is evaluated in both renders
- **THEN** both renders observe the identical array reference
  (`Object.is`)

### Requirement: Main-process tracker host wires the registry

`apps/desktop/src/main/deck-tracker.ts` SHALL instantiate one
`GlobalEffectsRegistry` per `DeckTracker` instance and forward
HearthWatcher `card:played` events to it before serializing each
snapshot.

The host MUST:

- Reset the registry whenever the underlying `Game` enters a new
  `PRE_MATCH` phase OR transitions back to `IDLE`.
- Subscribe to the same upstream `card:played` event stream that
  drives the deck multiset, dispatching events to the registry in
  the same order.
- Include the registry's `snapshot()` output as the snapshot's
  `friendlyEffects` / `opposingEffects` payload.

#### Scenario: Registry receives card-played events in order

- **GIVEN** a HearthWatcher fixture emitting `card:played` events
  in the order A, B, C
- **WHEN** the main-process host runs the fixture through one
  match cycle
- **THEN** the registry's `handleCardPlayed` was called with A,
  then B, then C, with no calls dropped or reordered

#### Scenario: Registry is reset on match boundary

- **GIVEN** a registry holding effects accumulated from match #1
- **WHEN** the orchestrator transitions to `PRE_MATCH` for match #2
- **THEN** the registry's snapshot returns `{ local: [], opposing: [] }`
  on the first tick of match #2
