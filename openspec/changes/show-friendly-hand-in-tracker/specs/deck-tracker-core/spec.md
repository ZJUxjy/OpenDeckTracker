## ADDED Requirements

### Requirement: LiveDeckPanel renders current friendly hand below remaining cards

`apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx` SHALL render a friendly-hand section in the player tracker panel during active matches. The section MUST appear below the remaining-cards section and MUST display the player's current hand cards in their in-game hand order, mapping left-to-right in-game positions to top-to-bottom tracker rows.

The hand section MUST:

- Render only for the player deck tracker panel, not the opponent panel.
- Use the active app locale for section labels, empty states, and card names.
- Resolve card names through the existing `@hdt/hearthdb` / `window.hdt.cards.findById` lookup path.
- Preserve the existing remaining-card section ordering, counts, draw animation, hover preview, and compact behavior.
- Use Console theme tokens for colors and `font-mono` for numeric hand-position or count indicators.
- Render a localized empty state when the active match has no known friendly hand cards.

If the core snapshot builds `friendlyHand` from HearthMirror `HandState`, the snapshot MUST preserve hand order by `zonePosition` ascending before renderer display. The renderer MUST NOT sort hand rows by mana cost, name, rarity, or `cardId`.

#### Scenario: Hand section appears below remaining cards

- **GIVEN** an active match snapshot with remaining deck cards and friendly hand cards
- **WHEN** `LiveDeckPanel` renders the player tracker
- **THEN** the remaining-card section appears first
- **AND** the friendly-hand section appears below it
- **AND** both sections are visually distinguishable by localized section labels

#### Scenario: Friendly hand rows follow in-game position order

- **GIVEN** a hand state where `Fireball` has `zonePosition = 1`, `Frostbolt` has `zonePosition = 2`, and `Arcane Intellect` has `zonePosition = 3`
- **WHEN** the tracker snapshot is rendered
- **THEN** the friendly-hand section displays `Fireball` above `Frostbolt`
- **AND** `Frostbolt` appears above `Arcane Intellect`
- **AND** mana cost or card name sorting does not reorder those rows

#### Scenario: Hand updates when cards are drawn or played

- **GIVEN** an active match snapshot where the friendly hand contains `Fireball` then `Frostbolt`
- **WHEN** the next snapshot reports `Fireball`, `Frostbolt`, then `Arcane Intellect`
- **THEN** the friendly-hand section adds `Arcane Intellect` as the bottom row
- **WHEN** a later snapshot reports only `Frostbolt` and `Arcane Intellect`
- **THEN** `Fireball` is removed from the friendly-hand section
- **AND** the remaining-card section keeps its existing draw behavior unchanged

#### Scenario: Hand section uses localized card names

- **GIVEN** the active app locale is `zh-CN`
- **AND** `window.hdt.cards.findById` resolves a friendly hand card to a Chinese card name
- **WHEN** `LiveDeckPanel` renders the friendly-hand section
- **THEN** the row displays the localized card name rather than only the raw `cardId`

#### Scenario: Empty hand state is explicit

- **GIVEN** an active match snapshot with an empty friendly hand
- **WHEN** `LiveDeckPanel` renders
- **THEN** the friendly-hand section remains present below remaining cards
- **AND** it displays a localized empty hand message

#### Scenario: Opponent panel is unaffected

- **WHEN** the opponent overlay or opponent cards panel renders
- **THEN** it does not render the friendly-hand section
- **AND** existing opponent revealed-card behavior is unchanged
