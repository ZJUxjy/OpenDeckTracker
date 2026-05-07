## ADDED Requirements

### Requirement: Global effects domain types in @hdt/core

`@hdt/core` SHALL expose a `global-effects/` submodule with the
public types `EffectDef`, `ActiveEffect`, `GameMode`, and
`ExpireRule` from `src/index.ts`.

`EffectDef<P>` MUST carry at minimum:

- `id: string` — kebab-case unique identifier, equal to the
  defining file's basename under `catalog/`.
- `sourceCardId: string` — the hsdata card id whose play triggers
  the effect.
- `side: 'caster'` — for M1, every effect attributes to whoever
  played the source card.
- `mode: GameMode` — `'STANDARD' | 'WILD' | 'TWIST' | 'ARENA' |
  'BATTLEGROUNDS' | 'MERCENARIES'`. M1 catalog entries MUST set
  `'STANDARD'`.
- `parameterExtractor?: (event, ctx) => Promise<P | null>` — optional
  hook to derive effect parameters from the active event stream.
- `expiresOn?: ExpireRule` — optional expiry rule, reserved for
  future use; M1 MUST NOT instantiate any rule.

`ActiveEffect<P>` MUST carry:

- `id: string` — the originating `EffectDef.id`.
- `sourceCardId: string` — denormalized for renderer convenience.
- `triggeredAt: number` — wall-clock ms when the registry recorded
  the trigger.
- `params?: P` — extracted parameters; absent when the extractor
  is not declared OR returned `null`.

#### Scenario: Public types are exported

- **WHEN** a downstream package imports `EffectDef`, `ActiveEffect`,
  `GameMode`, and `ExpireRule` from `@hdt/core`
- **THEN** all four resolve as TypeScript types without enabling
  any deep-import workaround

#### Scenario: M1 catalog enforces Standard-only

- **WHEN** the test suite enumerates every M1 `EffectDef` in
  `catalog/`
- **THEN** every entry's `mode === 'STANDARD'` and `side === 'caster'`

### Requirement: Effect catalog file layout

`packages/core/src/global-effects/catalog/` SHALL contain one
`<effect-id>.ts` file per known global effect. Each file MUST
default-export a single `EffectDef` whose `id` matches the file's
basename (kebab-case).

A barrel file `catalog/index.ts` SHALL aggregate every `EffectDef`
into a single immutable `EFFECT_CATALOG: readonly EffectDef[]`.
The aggregation MUST be deterministic (alphabetical by `id`).

#### Scenario: Catalog filename matches effect id

- **GIVEN** `catalog/cleansing-cleric.ts`
- **WHEN** its default export is evaluated
- **THEN** the export's `id` field equals `'cleansing-cleric'`

#### Scenario: Catalog has unique ids and unique sourceCardIds

- **WHEN** the test suite reads `EFFECT_CATALOG`
- **THEN** all `id` values are pairwise unique
- **AND** all `sourceCardId` values are pairwise unique

#### Scenario: Catalog source cardIds match the live hsdata
       collectible card pool

- **GIVEN** the generated `data/cards/generated/cards.collectible.enUS.json`
- **WHEN** the test suite checks each `EffectDef.sourceCardId`
- **THEN** every cardId is present in the collectible pool
- **AND** every catalog entry whose `mode === 'STANDARD'` belongs
  to a `STANDARD_SET_CODES` set per `set-meta.ts`

### Requirement: GlobalEffectsRegistry lifecycle

`GlobalEffectsRegistry` SHALL be a class instantiable per `Game`,
holding a per-side `Map<EffectDef['id'], ActiveEffect>` for
`localPlayer` and `opposingPlayer`.

The registry MUST:

- Reset both maps on `reset()`. The orchestrator MUST call
  `reset()` whenever the host `Game` transitions from `POST_MATCH`
  back to `IDLE` OR a new `PRE_MATCH` is entered.
- Expose `handleCardPlayed(event)` accepting a `CardPlayedEvent`
  shape `{ cardId, controllerId, timestamp }`.
- Look up `EffectDef` by `cardId` against the catalog; ignore
  events with no match.
- For matching effects, push an `ActiveEffect` into the
  controller-correct side map keyed by `EffectDef.id`. Re-trigger
  for the same `id` SHALL replace the prior entry (idempotent).
- Run `parameterExtractor` if declared. The extractor's promise
  MUST NOT block the registry's synchronous return; on resolution
  with a non-null value, the registry MUST update the prior
  `ActiveEffect.params` in place; on `null` the prior entry's
  `params` field stays `undefined`.

#### Scenario: Registry ignores unknown card plays

- **GIVEN** a fresh registry and a catalog containing only
  `cleansing-cleric`
- **WHEN** `handleCardPlayed({ cardId: 'EX1_001', controllerId: 1 })`
- **THEN** both side maps remain empty

#### Scenario: Registry attributes effect to caster's side

- **GIVEN** a `Game` whose `localPlayer.controllerId === 1`
- **WHEN** `handleCardPlayed({ cardId: <Cleansing Cleric cardId>,
  controllerId: 1 })`
- **THEN** `registry.localEffects` contains one entry with
  `id === 'cleansing-cleric'`
- **AND** `registry.opposingEffects` is empty

- **WHEN** `handleCardPlayed({ cardId: <Cleansing Cleric cardId>,
  controllerId: 2 })`
- **THEN** `registry.opposingEffects` contains one entry with
  `id === 'cleansing-cleric'`
- **AND** `registry.localEffects` still has its prior single entry

#### Scenario: Registry resets on match boundary

- **GIVEN** a registry with N active effects on each side
- **WHEN** `registry.reset()` is invoked
- **THEN** both side maps are empty

#### Scenario: Re-triggering an effect refreshes triggeredAt

- **GIVEN** a registry already holding `cleansing-cleric` for the
  local player at `triggeredAt = T0`
- **WHEN** the same player plays a second copy of Cleansing Cleric
  at `T1 > T0`
- **THEN** `localEffects` still contains exactly one entry with
  `id === 'cleansing-cleric'`
- **AND** its `triggeredAt === T1`

### Requirement: Parameterized effect extraction (Tame Pet pattern)

EffectDef entries that declare `parameterExtractor` MUST resolve
their parameters from the existing HearthWatcher event stream OR
return `null` to mark the effect as parameter-less.

Specifically for the `tame-pet` EffectDef:

- The extractor SHALL inspect Power.log entity events that occur
  within a bounded window after the source card's play, scoped to
  the same controller.
- It SHALL return `{ pool: [cardId, cardId, cardId] }` once three
  beast cardIds are observable as the new Animal Companion pool.
- If the window expires without three cardIds resolved, the
  extractor SHALL return `null`. The registry MUST NOT block the
  rest of the snapshot pipeline waiting on extraction.

#### Scenario: Tame Pet extractor populates pool

- **GIVEN** a fixture log capturing a real Tame Pet cast and three
  subsequent beast SHOW_ENTITY events for the casting controller
- **WHEN** the extractor runs against this stream
- **THEN** it resolves to `{ pool: [<cardId1>, <cardId2>, <cardId3>] }`
  in the order the entities appeared

#### Scenario: Tame Pet extractor degrades on missing data

- **GIVEN** a fixture log where Power.log truncates immediately
  after the Tame Pet cast (no follow-up SHOW_ENTITY events)
- **WHEN** the extractor runs against this stream
- **THEN** it resolves to `null`
- **AND** the corresponding `ActiveEffect` keeps `params === undefined`

### Requirement: Snapshot serialization

`GlobalEffectsRegistry` SHALL expose a `snapshot()` method
returning `{ local: ActiveEffect[]; opposing: ActiveEffect[] }`,
with each side's array sorted by `triggeredAt ascending` (stable
on tie).

`ActiveEffect` instances in the snapshot MUST be plain JSON
serializable: no class instances, no Maps, no functions. The
return value MUST be safe to `structuredClone` and to send through
Electron IPC without further transformation.

#### Scenario: Snapshot is JSON-safe

- **GIVEN** a registry with one `tame-pet` effect carrying a
  populated pool
- **WHEN** `snapshot()` is round-tripped through
  `JSON.parse(JSON.stringify(...))`
- **THEN** the result is structurally equal to the original

#### Scenario: Snapshot is stable on tie

- **GIVEN** two `ActiveEffect` entries with identical `triggeredAt`
- **WHEN** `snapshot()` is invoked twice without any intervening
  mutations
- **THEN** both calls return the entries in the same order
