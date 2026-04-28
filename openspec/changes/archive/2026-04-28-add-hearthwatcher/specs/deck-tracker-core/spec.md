## ADDED Requirements

### Requirement: Log-derived entity metadata ingestion

`@hdt/core` SHALL accept log-derived entity updates that populate existing `EntityInfo` metadata fields without requiring deck-tracker consumers to parse `Power.log` directly.

The ingestion path MUST support updates for:

- `cardId`
- `zone`
- `controllerId`
- `info.created`
- `info.stolen`
- `info.hidden`
- `info.mulliganed`
- `info.originalController`
- `info.originalZone`

#### Scenario: Created entity metadata is preserved

- **GIVEN** a log-derived update for entity `42` with card ID `Fireball`, controller ID equal to the local player, zone `HAND`, and `created=true`
- **WHEN** the update is applied to the core game state
- **THEN** `Game.entities.get(42)` has card ID `Fireball`, zone `HAND`, and `info.created === true`

#### Scenario: Hidden opponent entity is retained without card ID

- **GIVEN** a log-derived update for an opponent hand entity with no public card ID and `hidden=true`
- **WHEN** the update is applied to the core game state
- **THEN** the entity remains present in `Game.entities`
- **AND** its card ID is empty
- **AND** `info.hidden === true`

### Requirement: Remaining calculation honors log-derived origins

`@hdt/core` SHALL use log-derived entity metadata when computing remaining cards so additional entities do not consume original deck copies.

Entities where `entity.info.created === true` MUST be excluded from the original-deck seen subtraction even when their card ID exists in the original deck. Entity identity MUST be preserved at the `Entity.entityId` level so a generated copy with the same card ID as an original copy can be tracked separately.

#### Scenario: Created same-card copy does not subtract original copy

- **GIVEN** an original deck containing `{ Fireball: 2 }`
- **AND** one seen friendly entity has card ID `Fireball` and `info.created === true`
- **WHEN** `computeRemaining` is called
- **THEN** remaining original deck count for `Fireball` is still `2`

#### Scenario: Original same-card copy still subtracts original copy

- **GIVEN** an original deck containing `{ Fireball: 2 }`
- **AND** one seen friendly entity has card ID `Fireball` and `info.created !== true`
- **WHEN** `computeRemaining` is called
- **THEN** remaining original deck count for `Fireball` is `1`

#### Scenario: Generated card in deck appears only as overflow

- **GIVEN** an original deck containing `{ Fireball: 2 }`
- **AND** no original `Fireball` has been seen outside the deck
- **AND** deck entities contain three friendly known `Fireball` entities, one of which has `info.created === true`
- **WHEN** `computeRemaining` is called
- **THEN** remaining contains `Fireball: 3`
- **AND** the extra count represents only the overflow copy beyond the original deck count

### Requirement: Opponent non-card entities are ignored by card tracking

`@hdt/core` SHALL avoid recording opponent hero and hero power entities as opponent hand, deck, or played cards when log-derived entity updates identify those entities as heroes, hero powers, or non-card game entities.

#### Scenario: Opponent hero is not tracked as a card

- **GIVEN** a log-derived opponent entity with a hero card ID and zone `PLAY`
- **WHEN** opponent card tracking builds card lists from core state
- **THEN** that hero entity is not included in opponent hand, deck, secret, or played-card lists

#### Scenario: Opponent hero power is not tracked as a card

- **GIVEN** a log-derived opponent entity with a hero power card ID and zone `PLAY`
- **WHEN** opponent card tracking builds card lists from core state
- **THEN** that hero power entity is not included in opponent hand, deck, secret, or played-card lists

#### Scenario: Normal opponent played card is still tracked

- **GIVEN** a log-derived opponent entity with a collectible minion or spell card ID and a transition from `HAND` to `PLAY`
- **WHEN** opponent card tracking builds played-card lists from core state
- **THEN** that entity is included as an opponent played card
