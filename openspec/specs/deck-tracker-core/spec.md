### Requirement: @hdt/core workspace package

The repository SHALL contain a new workspace package `@hdt/core`
under `packages/core/` exposing the deck-tracker domain layer.

The package MUST:

- Use `type: module`, TypeScript strict, the existing project tsconfig
  base (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`).
- Export a public API surface from `src/index.ts` covering at minimum:
  `Game`, `Player`, `Entity`, `DeckSnapshot`, `MatchPhase`,
  `DeckTracker`, `IDeckIdentifier`, `MatchEvent`.
- NOT depend on Electron, React, or any DOM API. The package MUST
  be runnable in pure Node + Vitest.
- Depend on `@hdt/hearthmirror` (TS facade) for live-bridge access
  and `@hdt/hearthdb` (optional, only for type compatibility) for
  card-id types.

#### Scenario: Package builds and tests in isolation

- **WHEN** `pnpm --filter @hdt/core typecheck` and
  `pnpm --filter @hdt/core test` are run
- **THEN** both pass without requiring Electron or any browser
  environment

### Requirement: Game / Player / Entity domain model

`@hdt/core` SHALL expose a per-match canonical state-machine triplet
`Game / Player / Entity` modelling the constructed-mode subset of
state needed for deck tracking.

`Game` MUST hold:

- `phase: MatchPhase` (one of `IDLE`, `PRE_MATCH`, `IN_MATCH`,
  `POST_MATCH`).
- `localPlayer: Player`, `opposingPlayer: Player`.
- `entities: Map<entityId, Entity>` populated from live-bridge polls.
- `gameType / formatType / missionId` mirrored from `getMatchInfo`.
- `startedAt / endedAt` timestamps.

`Player` MUST hold:

- `name: string`, `controllerId: number`, `isLocal: boolean`.
- `hand / board / deck / graveyard / secret`: all
  `Entity[]` projections of `Game.entities` filtered by zone +
  controller.
- `originalDeck: DeckSnapshot | null` (set on PRE_MATCH→IN_MATCH
  transition for `localPlayer` only; `null` for `opposingPlayer`
  in M2).

`Entity` MUST hold:

- `entityId: number`, `cardId: string`, `zone: Zone`,
  `controllerId: number`.
- `info: EntityInfo` — a TypeScript interface with optional fields
  (`created?: boolean`, `stolen?: boolean`, `hidden?: boolean`,
  `mulliganed?: boolean`, `originalController?: number`,
  `originalZone?: Zone`). M2 leaves all fields `undefined` (no log
  events to populate); M3 will fill them in.

The classes MUST be **mutation-friendly** — direct field assignment
is the supported update mechanism (no immer, no Immutable.js).
Consumers may freely mutate `entities` Map and field values; the
poller / future log-feeder is the only writer.

#### Scenario: Game phase transitions

- **GIVEN** a fresh `Game` in `IDLE` phase
- **WHEN** the poller calls `game.transitionTo('PRE_MATCH')`
- **THEN** `game.phase === 'PRE_MATCH'` and `game.startedAt` is set
  to the current timestamp
- **WHEN** the poller calls `game.transitionTo('POST_MATCH')`
- **THEN** `game.endedAt` is set and `game.phase === 'POST_MATCH'`

#### Scenario: Player zone projections derive from entities

- **GIVEN** a Player and a Game with 5 entities controlled by that
  player (3 in HAND, 2 in DECK)
- **WHEN** `player.hand` and `player.deck` are read
- **THEN** they return arrays of length 3 and 2 respectively, each
  containing only entities matching the controller and zone

#### Scenario: Entity defaults info to all-undefined in M2

- **WHEN** a new `Entity({ entityId, cardId, zone, controllerId })`
  is constructed without an explicit `info`
- **THEN** `entity.info.created`, `entity.info.stolen`,
  `entity.info.hidden`, `entity.info.mulliganed` are all `undefined`

### Requirement: DeckSnapshot multiset model

`@hdt/core` SHALL expose a `DeckSnapshot` class representing a
multiset of cards (cardId → count).

`DeckSnapshot` MUST support:

- Construction from a `getDecks` deck object
  (`{ cards: { cardId, count }[] }`).
- `total(): number` — sum of all counts.
- `subtract(other: DeckSnapshot | { cardId: string }[]): DeckSnapshot` —
  returns a new snapshot with `other` removed (negative counts clamp
  to 0). Used by the remaining-cards algorithm.
- `extras(seenMultiset): { cardId, count }[]` — returns cards that
  appear in `seenMultiset` but NOT in `this` (i.e. created/stolen/etc.
  in M2 terms).
- `entries(): { cardId: string, count: number }[]` — sorted by
  `cardId` for stable rendering.

Operations MUST NOT mutate the operands; all mutators return new
`DeckSnapshot` instances.

#### Scenario: subtract removes seen cards

- **GIVEN** a DeckSnapshot of `{ Coin: 1, Fireball: 2, Frostbolt: 2 }`
  (total = 5)
- **WHEN** `subtract([{ cardId: 'Fireball' }, { cardId: 'Coin' }])`
  is called
- **THEN** the result has `{ Fireball: 1, Frostbolt: 2 }` (total = 3)
  and `Coin` is absent

#### Scenario: extras finds created cards

- **GIVEN** a DeckSnapshot of `{ Fireball: 2 }`
- **WHEN** `extras([{ cardId: 'Fireball' }, { cardId: 'PyroChampion' },
  { cardId: 'PyroChampion' }])` is called
- **THEN** the result is `[{ cardId: 'PyroChampion', count: 2 }]`

### Requirement: Remaining-cards algorithm

`@hdt/core` SHALL expose a `computeRemaining` function that derives the displayable friendly deck state using both cards seen outside the deck and known cards currently in the deck.

The function MUST accept:

- `originalDeck: DeckSnapshot`
- `seenEntities: Entity[]` built from friendly HAND / PLAY / GRAVEYARD / SECRET zones
- `deckEntities: Entity[]` built from the friendly DECK zone
- `localControllerId: number`

`seenEntities` MUST be filtered to entities where `entity.cardId` is non-empty AND `entity.controllerId === localControllerId` AND `entity.info.created !== true`.

`deckEntities` MUST be filtered to entities where `entity.cardId` is non-empty AND `entity.controllerId === localControllerId`.

`computeRemaining` MUST:

- Build `seenSnapshot` from filtered `seenEntities`.
- Build `baseRemaining = originalDeck.subtract(seenSnapshot)`.
- Build `knownDeckSnapshot` from filtered `deckEntities`.
- Build `shuffledIntoDeck = baseRemaining.extras(knownDeckSnapshot)`.
- Return `remaining = baseRemaining + shuffledIntoDeck`.
- Return `extras = originalDeck.extras(seenSnapshot)`.

The algorithm MUST be deterministic and pure (same inputs -> same outputs, no side effects). Known cards currently in the DECK zone that do not exceed `baseRemaining` MUST NOT be double-counted.

#### Scenario: Mid-match remaining computation

- **GIVEN** an originalDeck with 30 cards and seenEntities containing 5 distinct cards from that original deck
- **WHEN** `computeRemaining` is called with no known deck overflow
- **THEN** `remaining.total() === 25` and `extras` is empty

#### Scenario: Known shuffled card appears in remaining deck

- **GIVEN** an originalDeck of `{ Fireball: 2 }`, no seenEntities, and deckEntities containing `{ cardId: 'Albatross' }` controlled by the local player
- **WHEN** `computeRemaining` is called
- **THEN** `remaining` contains `Fireball: 2` and `Albatross: 1`
- **AND** `extras` is empty

#### Scenario: Same-card shuffled copy only adds overflow

- **GIVEN** an originalDeck of `{ Fireball: 2 }`, seenEntities containing one `Fireball`, and deckEntities containing two known `Fireball` entities
- **WHEN** `computeRemaining` is called
- **THEN** `baseRemaining` accounts for one original `Fireball`
- **AND** `remaining` contains `Fireball: 2`, representing one expected original copy plus one overflow shuffled copy

#### Scenario: Known original deck entity is not double-counted

- **GIVEN** an originalDeck of `{ Fireball: 2 }`, no seenEntities, and deckEntities containing one known `Fireball`
- **WHEN** `computeRemaining` is called
- **THEN** `remaining` contains `Fireball: 2`, not `Fireball: 3`

#### Scenario: Unknown face-down deck additions are ignored by card list

- **GIVEN** an originalDeck of `{ Fireball: 2 }` and deckEntities containing an entity with empty `cardId`
- **WHEN** `computeRemaining` is called
- **THEN** the empty-card entity does not add a row to `remaining`

#### Scenario: Stolen card outside the deck surfaces as extra

- **GIVEN** an originalDeck of `{ Fireball: 2 }` and seenEntities containing `{ cardId: 'StolenCard' }`
- **WHEN** `computeRemaining` is called
- **THEN** `remaining` still has `Fireball: 2`
- **AND** `extras === [{ cardId: 'StolenCard', count: 1 }]`

### Requirement: DeckTracker orchestrator

`@hdt/core` SHALL expose a `DeckTracker` class that runs an adaptive
polling loop against `@hdt/hearthmirror` and emits typed events.

`DeckTracker` MUST:

- Accept a `HearthMirror` instance and an optional `IDeckIdentifier`
  in its constructor.
- Expose `start()` / `stop()` methods controlling the loop lifecycle.
- Expose an `on(event: 'state-change' | 'match-started' |
  'match-ended', handler)` event subscription API.
- Adapt poll rate per phase (per design D6):
  - IDLE: 2000ms
  - PRE_MATCH: 500ms
  - IN_MATCH: 500ms baseline, 100ms one-shot after detecting hand-size
    change
  - POST_MATCH: one-shot finalization
- NEVER call `getCollection` from the poll loop (per design D6).
- Surface poll errors via the event stream (`{ type: 'error',
  reflector: 'getMatchInfo', message }`) instead of throwing.

The `IDeckIdentifier` interface MUST allow injecting either the
in-game memory-field reader (default M2 implementation) or a
user-provided callback (for the dialog-fallback flow):

```ts
interface IDeckIdentifier {
  identify(
    snapshot: { decks: Deck[], matchInfo: MatchInfo },
  ): Promise<{ deckId: number; cards: { cardId: string, count: number }[] } | null>;
}
```

#### Scenario: Idle polling rate

- **GIVEN** Hearthstone is closed (`isAlive` returns false)
- **WHEN** `DeckTracker.start()` is called and runs for 5 seconds
- **THEN** the poll count is approximately 2-3 (one every 2000ms),
  NOT every 250ms

#### Scenario: Match-started event emission

- **GIVEN** the tracker is in IDLE and the next poll detects
  `getMatchInfo` returns a non-null result
- **WHEN** the next poll runs
- **THEN** a `match-started` event is emitted with
  `{ matchInfo, originalDeck }` payload, where `originalDeck` is
  resolved via the `IDeckIdentifier`

#### Scenario: Phase machine transitions through full match

- **GIVEN** the tracker is in IDLE
- **WHEN** the user enters a match, plays mulligan, plays cards, and
  the match ends
- **THEN** the tracker emits the sequence: `match-started` →
  N × `state-change` → `match-ended`, with phase strictly
  monotonic IDLE → PRE_MATCH → IN_MATCH → POST_MATCH → IDLE

### Requirement: Default in-game deck identifier

`@hdt/core` SHALL provide a default `IDeckIdentifier` implementation
(`InGameDeckIdentifier`) that reads the in-game "currently selected
play deck" identifier via the `@hdt/hearthmirror` facade, then matches
it against `getDecks()` to pull the full card list.

The implementation MUST:

- Call a yet-to-be-named hearthmirror method (Spike outcome — see
  design OQ1) that returns the `i64` deck ID currently selected in
  the player's deck-picker UI.
- If the returned ID is non-zero AND matches one of the `getDecks()`
  entries, return that deck.
- If the returned ID is zero / null / no match, return `null` —
  signalling the orchestrator to invoke the dialog fallback.
- NEVER throw — failure modes return `null`.

#### Scenario: Standard ranked deck pre-selected

- **GIVEN** the user has selected "那个男人" (deckId=12345) in the
  in-game deck picker and queued a Standard ranked match
- **WHEN** `InGameDeckIdentifier.identify(snapshot)` is called after
  match start
- **THEN** the result is the matching `Deck` object from `snapshot.decks`
  with the 30-card list populated

#### Scenario: Practice mode returns null

- **GIVEN** the user is in Practice mode (no deck-picker selection)
- **WHEN** `InGameDeckIdentifier.identify` is called
- **THEN** the result is `null`

### Requirement: Electron main-process tracker host

`apps/desktop/src/main/deck-tracker.ts` (NEW) SHALL host a single
`DeckTracker` instance per Electron app session, lifetime-bound to
the main process.

The host MUST:

- Instantiate the tracker on app `whenReady`.
- Forward all tracker events to all `BrowserWindow` instances via
  `webContents.send('deck-tracker:state', snapshot)` (per design D8)
  AND `webContents.send('deck-tracker:event', event)` for typed events.
- Provide an IPC handler `'deck-tracker:select-deck'` that lets the
  renderer respond to the dialog-fallback flow by injecting a
  user-picked deck back into the orchestrator.
- Provide an IPC handler `'deck-tracker:get-snapshot'` for renderer
  initialization (returns the current snapshot synchronously to
  avoid race on store init).
- Stop the tracker on `before-quit`.

#### Scenario: Renderer subscribes mid-match

- **GIVEN** Hearthstone is in an active match and the tracker has
  been running, and the renderer window has just opened
- **WHEN** the renderer calls `'deck-tracker:get-snapshot'`
- **THEN** it receives the current full snapshot WITHOUT having to
  wait for the next poll

### Requirement: Renderer Zustand store + React panel

`apps/desktop/src/renderer/src/stores/deck-tracker-store.ts` SHALL
expose a Zustand store mirroring the IPC-pushed snapshot.

The store MUST:

- Initialize with `{ snapshot: null, phase: 'IDLE', error: null }`.
- Subscribe to `deck-tracker:state` IPC events on the first
  `useDeckTracker` hook mount; unsubscribe on last unmount.
- Provide selectors `useDeckTrackerSnapshot()`, `useDeckTrackerPhase()`,
  `useDeckTrackerError()`.

`apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx` (NEW)
SHALL render the live deck contents during IN_MATCH phase.

The component MUST:

- Show "等待对局开始..." (or English equivalent per i18n setup)
  during IDLE / PRE_MATCH.
- Show a vertical list of unique cards in `originalDeck`, one row
  per cardId, ordered by mana cost ascending then alphabetically.
- Each row displays: card name (via `@hdt/hearthdb` lookup) / mana
  cost / `remaining / total` count / rarity color tint.
- Cards with `remaining === 0` render dimmed.
- The most-recently-drawn card (delta vs previous snapshot) gets a
  subtle 1s highlight animation.
- An "extras" badge shows when `snapshot.extras.length > 0`,
  e.g. `+2 卡牌` (created/stolen approximate count).
- An empty / disconnected state shows the empty-state with a
  diagnostic line ("Hearthstone 未运行" / "未识别到对局").

`apps/desktop/src/renderer/src/components/DeckSelectDialog.tsx` (NEW)
SHALL prompt the user to pick a deck when the orchestrator's
identifier returns null.

The dialog MUST:

- Use Radix Dialog primitives (already in `apps/desktop` deps).
- List all `getDecks()` results filterable by hero class.
- Persist the user's last choice per game-mode in `localStorage`
  for next-match pre-selection.

#### Scenario: Live deck panel shows 30 cards on match start

- **GIVEN** the user enters a match with a 30-card Standard deck
  identified by `InGameDeckIdentifier`
- **WHEN** the renderer mounts and the tracker pushes the initial
  snapshot
- **THEN** the panel displays N rows summing to 30 cards
  (where N = number of unique cardIds in the deck)

#### Scenario: Drawing a card updates the panel within 500ms

- **GIVEN** an active match and a deck with `Fireball x2 / Frostbolt x2`
- **WHEN** the user draws a Fireball
- **THEN** within 500ms (one polling interval) the Fireball row
  shows `1 / 2` instead of `2 / 2` and is briefly highlighted

#### Scenario: Dialog fallback for unidentified deck

- **GIVEN** the user enters Practice mode (no in-game selection)
- **WHEN** the tracker reaches IN_MATCH phase
- **THEN** `DeckSelectDialog` opens with the user's saved decks listed
- **WHEN** the user picks a deck and confirms
- **THEN** the orchestrator receives the choice via
  `'deck-tracker:select-deck'` and `LiveDeckPanel` populates within
  the next poll

### Requirement: Deck copy expansion utility in @hdt/core

`@hdt/core` SHALL expose a pure utility `expandDeckToCopies` that
expands aggregated deck entries (`{ cardId, count }[]`) into one entry
per physical copy with stable keys.

The utility MUST:

- Return one row per copy (e.g. `count = 2` returns two entries).
- Generate deterministic copy keys for React list stability.
- Ignore invalid counts (`<= 0`) instead of producing rows.
- Remain framework-agnostic (no React/Electron dependencies).

#### Scenario: Aggregated card count expands to physical copies

- **WHEN** renderer code calls
  `expandDeckToCopies([{ cardId: 'Fireball', count: 2 }])`
- **THEN** it receives two entries with distinct copy keys and shared
  `cardId` `Fireball`

#### Scenario: Invalid counts are ignored

- **WHEN** `expandDeckToCopies([{ cardId: 'EX1_277', count: 0 }])` is called
- **THEN** no rows are returned for that card entry

### Requirement: LiveDeckPanel supports per-copy rows, draw-pop animation, and hover card art

`apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx` SHALL
render IN_MATCH deck state as physical card-copy rows, animate drawn
cards out of the list, and show card art on hover.

The component MUST:

- Render one row per physical copy expanded from `snapshot.deck.remaining`, not only from `snapshot.deck.original`.
- Render remaining cards whose `cardId` is absent from `snapshot.deck.original`.
- Sort rows by mana cost ascending, then card name ascending, then
  `cardId` ascending.
- Use `@hdt/hearthdb` definitions for card name/cost/rarity display.
- Resolve card definitions for the union of `snapshot.deck.original` and `snapshot.deck.remaining` card ids.
- When `remaining[cardId]` decreases, animate the disappearing copy row
  and remove that row after the animation completes.
- Avoid keeping zero-count placeholder rows in the list.
- Show a delayed hover popup containing the card image and close it when
  hover ends.
- Show the header remaining count from `snapshot.deck.remaining`; the count MAY exceed the original deck total when known cards have been shuffled into the deck.

#### Scenario: Initial match render shows 30 physical rows

- **GIVEN** the user enters a match with a 30-card deck
- **WHEN** the renderer receives the first in-match snapshot
- **THEN** the panel renders 30 physical rows ordered by cost/name/cardId

#### Scenario: Shuffled-in remaining card appears as a row

- **GIVEN** an active match snapshot where `deck.original` contains `Fireball x2` and `deck.remaining` contains `Fireball x2` plus `Albatross x1`
- **WHEN** the panel renders
- **THEN** it displays three physical rows
- **AND** one row displays `Albatross`
- **AND** the header remaining count is `3`

#### Scenario: Drawn card row exits and is removed

- **GIVEN** an active match with two copies of `Fireball`
- **WHEN** one `Fireball` is drawn
- **THEN** exactly one row enters exit animation and is removed after
  animation completion

#### Scenario: Drawn shuffled-in card row exits and is removed

- **GIVEN** an active match snapshot where `deck.remaining` contains a shuffled-in `Albatross`
- **WHEN** the next snapshot no longer contains `Albatross`
- **THEN** the `Albatross` row enters exit animation and is removed after animation completion

#### Scenario: Hovering a row shows card image popup

- **GIVEN** a visible row with cardId `EX1_277`
- **WHEN** the user hovers long enough to pass the hover-delay threshold
- **THEN** the panel shows a popup image for `EX1_277` and hides it when
  hover ends

### Requirement: TS facade schema realignment with Rust reflectors (M1 prerequisite)

`packages/hearthmirror/src/{hearthmirror.ts, types.ts}` SHALL be
realigned with the current Rust reflector schemas (post Phase-7).

The facade MUST:

- Drop dead fields no longer present in the Rust schema:
  `MatchPlayer.{accountIdHi, accountIdLo, battleTagName, battleTagFull}`,
  `DeckCard.dbfId`, `GameServerInfo.resumable`.
- Add new fields present in the Rust schema:
  `MedalInfoData.{streak, bestStarLevel}`,
  `MatchPlayer.{side, cardbackId}`,
  `Deck.{seasonId, cardbackId, createDateMicrosec}`,
  `DeckCard.cardId` (string, replacing `dbfId`).
- Expose 7 new methods with corresponding TS types:
  `getEditedDeck()`, `isMulligan()`, `getBoardState()`,
  `getHandState()`, `getDeckState()`, `getOpponentSecrets()`,
  `getChoices()`.
- Update `getGameType()` return type from `Promise<number>` to
  `Promise<GameTypeResult | null>`.

The native binary
`packages/hearthmirror/native/hearthmirror-native.win32-x64-msvc.node`
SHALL be rebuilt via `napi build --release` so the JS layer can
load the new methods.

`apps/desktop/src/main/ipc.ts` and `apps/desktop/src/preload/index.ts`
SHALL be updated to forward the 7 new methods + the renamed shapes
to the renderer with corresponding `hearthmirror:*` IPC channels.

#### Scenario: TS package typechecks after schema sync

- **WHEN** `pnpm --filter @hdt/hearthmirror typecheck` is run
- **THEN** it passes with no errors

#### Scenario: Renderer can call new methods

- **WHEN** the renderer code calls `window.hdt.hearthmirror.getBoardState()`
- **THEN** the call resolves to the same shape returned by the Rust
  `getBoardState` reflector (typed `BoardStateResult | null`)
