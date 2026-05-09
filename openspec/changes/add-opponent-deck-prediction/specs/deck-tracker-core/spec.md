## ADDED Requirements

### Requirement: Opponent class is captured in the snapshot

`DeckTrackerSnapshot` SHALL include a field
`opponentClass: HeroClass | null`. The deck-tracker MUST resolve the
opposing player's class by:

1. Locating the opposing hero entity (entity with `cardId` matching the
   `HERO_*` pattern in `game.opposingPlayer.entities`)
2. Looking up the corresponding `CardDef` via the deck-tracker's
   injected `cardLookup`
3. Mapping `cardDef.cardClass` to a `HeroClass` value (`'DEATHKNIGHT' |
   'DEMONHUNTER' | 'DRUID' | 'HUNTER' | 'MAGE' | 'PALADIN' | 'PRIEST' |
   'ROGUE' | 'SHAMAN' | 'WARLOCK' | 'WARRIOR'`); non-player classes
   (`'DREAM'`, `'WHIZBANG'`, etc.) MUST yield `null`

When the hero entity is missing, the lookup fails, or the resolved
class is not a player class, the field MUST be `null`. The deck-tracker
MUST NOT throw on resolution failure.

The field MUST be stable across snapshots once set: subsequent snapshots
during the same match MUST return the same `opponentClass` even if the
hero entity is briefly missing from `game.opposingPlayer.entities` mid-
turn (e.g., during a hero-swap transition). The deck-tracker MAY cache
the resolved class for the lifetime of the match.

#### Scenario: Snapshot exposes opponent class for a Mage opponent

- **GIVEN** the opposing hero entity's `cardId` resolves to a `MAGE`
  hero `CardDef`
- **WHEN** the deck-tracker builds a snapshot
- **THEN** `snapshot.opponentClass === 'MAGE'`

#### Scenario: Missing hero entity yields null

- **GIVEN** `game.opposingPlayer.entities` contains no `HERO_*` cardId
- **WHEN** the deck-tracker builds a snapshot
- **THEN** `snapshot.opponentClass === null`
- **AND** the snapshot is otherwise valid (no throw)

#### Scenario: Class persists across mid-match transitions

- **GIVEN** `opponentClass` was set to `'PRIEST'` in a prior snapshot
- **WHEN** the next snapshot's hero entity is briefly missing
- **THEN** `snapshot.opponentClass === 'PRIEST'`

### Requirement: OpponentCardRecord propagates the created flag

`OpponentCardRecord` SHALL include a field `created: boolean`. The
deck-tracker's `buildOpponentRecords()` projection MUST set this field
to the value of the corresponding entity's `info.created` flag (which
the HearthWatcher's origin classifier populates), defaulting to `false`
when `info.created` is absent.

This flag MUST flow through to every consumer of
`DeckTrackerSnapshot.opponent.revealed` and
`DeckTrackerSnapshot.opponent.graveyard` so that downstream code can
distinguish original-deck cards from cards introduced via Discover /
Generate / random-create effects.

#### Scenario: Field exists on every opponent card record

- **WHEN** the deck-tracker builds opponent records
- **THEN** every record in `revealed` and `graveyard` has a boolean
  `created` field

#### Scenario: Created entities are flagged

- **GIVEN** an opponent entity whose `info.created === true` (set by
  the origin classifier when the card appeared after the original-deck
  count for that cardId was exhausted)
- **WHEN** the deck-tracker builds opponent records
- **THEN** the corresponding record's `created === true`

#### Scenario: Original-deck entities are not flagged

- **GIVEN** an opponent entity whose `info.created` is absent or `false`
- **WHEN** the deck-tracker builds opponent records
- **THEN** the corresponding record's `created === false`
