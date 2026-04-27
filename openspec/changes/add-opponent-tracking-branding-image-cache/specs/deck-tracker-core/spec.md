## ADDED Requirements

### Requirement: Opponent revealed card tracking

`@hdt/core` SHALL track opponent cards whose `cardId` has been revealed through public match zones and expose them in `DeckTrackerSnapshot`.

Opponent hero and hero-power entities MUST NOT be recorded as opponent cards, even when they appear in reflected public board state.

The snapshot MUST include an opponent card section containing, at minimum:

- `revealed`: copy-level records for opponent cards observed in public zones.
- `graveyard`: copy-level records for opponent cards that are no longer visible but remain known.
- Each record MUST include `entityId`, `cardId`, `zone`, and a stable display order.

The tracker MUST NOT expose identities for unrevealed opponent hand or deck cards.

#### Scenario: Opponent board card is revealed

- **WHEN** `getBoardState()` returns an opposing entity with a non-empty `cardId`
- **THEN** the next `DeckTrackerSnapshot` contains that card in `opponent.revealed`
- **AND** the snapshot does not add any hidden opponent hand or deck card identities

#### Scenario: Opponent hero and hero power are ignored

- **WHEN** `getBoardState()` returns opposing board entities for the opponent hero, opponent hero power, and a revealed playable card
- **THEN** the next `DeckTrackerSnapshot` contains only the playable card in `opponent.revealed`
- **AND** the opponent hero and hero power do not appear in `opponent.revealed` or `opponent.graveyard`

#### Scenario: Opponent card leaves visible play

- **WHEN** a previously revealed opposing board entity is missing from a later visible-zone snapshot
- **THEN** the tracker retains that card in `opponent.graveyard`
- **AND** the card does not disappear from opponent history during the same match

#### Scenario: Opponent hidden data remains hidden

- **WHEN** the tracker receives only `opposingHandCount` and `opposingDeckCount`
- **THEN** `opponent.revealed` and `opponent.graveyard` do not contain synthetic card records from those counts

### Requirement: Opponent cards sidebar state for renderers

The Electron renderer store SHALL mirror opponent revealed/graveyard card data from `DeckTrackerSnapshot` and make it available to React components without direct HearthMirror calls.

The opponent sidebar MUST:

- Render separately from the local remaining-deck sidebar.
- Display revealed opponent cards by card name, mana cost, rarity tint, and count or copy rows.
- Display opponent graveyard cards distinctly from currently visible revealed cards.
- Use the same card definition lookup source as the local tracker panel.
- Show an empty state when no opponent card has been revealed.

#### Scenario: Sidebar shows opponent played card

- **WHEN** the renderer receives a snapshot containing an opponent revealed `Fireball`
- **THEN** the opponent sidebar displays `Fireball` in the revealed/played section

#### Scenario: Sidebar shows opponent graveyard

- **WHEN** the renderer receives a snapshot where a previously revealed opponent minion is now in `opponent.graveyard`
- **THEN** the opponent sidebar displays that minion in the graveyard section

#### Scenario: Sidebar empty state

- **WHEN** the user is in a match but no opponent card has been revealed
- **THEN** the opponent sidebar displays an empty state instead of mock cards
