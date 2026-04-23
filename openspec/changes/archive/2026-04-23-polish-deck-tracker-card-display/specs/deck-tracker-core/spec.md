## ADDED Requirements

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

- Render one row per physical copy expanded from `snapshot.deck.original`
  (not one row per unique `cardId`).
- Sort rows by mana cost ascending, then card name ascending, then
  `cardId` ascending.
- Use `@hdt/hearthdb` definitions for card name/cost/rarity display.
- When `remaining[cardId]` decreases, animate the disappearing copy row
  and remove that row after the animation completes.
- Avoid keeping zero-count placeholder rows in the list.
- Show a delayed hover popup containing the card image and close it when
  hover ends.

#### Scenario: Initial match render shows 30 physical rows

- **GIVEN** the user enters a match with a 30-card deck
- **WHEN** the renderer receives the first in-match snapshot
- **THEN** the panel renders 30 physical rows ordered by cost/name/cardId

#### Scenario: Drawn card row exits and is removed

- **GIVEN** an active match with two copies of `Fireball`
- **WHEN** one `Fireball` is drawn
- **THEN** exactly one row enters exit animation and is removed after
  animation completion

#### Scenario: Hovering a row shows card image popup

- **GIVEN** a visible row with cardId `EX1_277`
- **WHEN** the user hovers long enough to pass the hover-delay threshold
- **THEN** the panel shows a popup image for `EX1_277` and hides it when
  hover ends
