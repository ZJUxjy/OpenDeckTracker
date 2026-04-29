## ADDED Requirements

### Requirement: LiveDeckPanel exposes a compact pip-count variant for overlay use

`apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx` SHALL
accept an optional `compact?: boolean` prop (default `false`). When
`compact === true` the in-match render branch MUST switch to a
single-row-per-cardId layout with pip indicators in place of the
per-physical-copy row expansion used by the desktop variant.

The compact branch MUST:

- Render exactly one row per unique entry in `snapshot.deck.remaining`,
  sorted by `(cost ascending, name ascending, cardId ascending)`.
- Render a pip widget (per the new `CardPips` component) on each row
  showing `remaining` filled dots out of `max` total dots, where
  `max = Math.max(originalCount, remainingCount)` and `originalCount`
  is the cardId's pre-match copy count from `snapshot.deck.original`
  (defaults to `remainingCount` when not present, e.g. shuffled-in
  cards).
- Render rows whose `remaining === 0` with reduced opacity
  (visual "spent" state) and without rarity tint, but keep them in
  the list. The compact branch MUST NOT play the per-copy slide-out
  exit animation (`animate-deck-exit`) that the desktop variant uses.
- Re-use the panel's existing header, footer, empty/loading states,
  and i18n keys without modification.

`apps/desktop/src/renderer/src/components/CardPips.tsx` (NEW) SHALL
export a pure component with the props
`{ remaining: number; max: number }` rendering up to `max` dots,
the first `Math.max(0, Math.min(remaining, max))` filled with
`var(--accent)` and the remainder hollow (border-only). The dots
MUST use only Console theme tokens for color and MUST be wrapped in
an element that responds to `transition-colors` so a fill change
animates without layout shift.

`apps/desktop/src/renderer/src/components/OverlayView.tsx` SHALL pass
`compact={true}` when mounting `<LiveDeckPanel />`. The desktop
tracker route SHALL NOT pass the prop (default `false` preserves
the existing per-copy expansion + slide-out behavior).

#### Scenario: Compact variant collapses copies into one row per cardId

- **GIVEN** an active match with `Fireball x2`, `Frostbolt x2`, and
  one legendary `Alexstrasza`
- **WHEN** `<LiveDeckPanel compact />` renders the in-match snapshot
- **THEN** exactly three rows are rendered (Alexstrasza, Fireball,
  Frostbolt), not five

#### Scenario: Pip widget reflects remaining vs original

- **GIVEN** a Fireball row with `original = 2, remaining = 1`
- **WHEN** the row renders
- **THEN** its pip widget renders 2 dots, the first filled with
  `var(--accent)` and the second hollow

#### Scenario: Legendary row renders one pip

- **GIVEN** an Alexstrasza row with `original = 1, remaining = 1`
- **WHEN** the row renders
- **THEN** its pip widget renders exactly 1 filled dot

#### Scenario: Drawn-to-zero row dims and stays visible

- **GIVEN** a Fireball row whose `remaining` drops from 1 to 0 in a
  fresh snapshot
- **WHEN** the new snapshot mounts
- **THEN** the row's container has `opacity-40` (or equivalent
  reduced-opacity utility) applied
- **AND** all pips are hollow
- **AND** the row is still present in the DOM (no slide-out exit)

#### Scenario: Desktop variant is unaffected

- **WHEN** `<LiveDeckPanel />` renders without the `compact` prop
- **THEN** the panel renders one row per physical copy as before
- **AND** drawing a card still triggers the existing 2 s slide-out
  exit animation on the corresponding copy row

#### Scenario: OverlayView mounts the compact variant

- **WHEN** the `/overlay` route renders `OverlayView`
- **THEN** the `<LiveDeckPanel />` it mounts receives `compact={true}`

#### Scenario: Pip dots use only token-derived colors

- **WHEN** any pip widget renders
- **THEN** the filled fill resolves to `var(--accent)` and the hollow
  variant uses `border-border` (or equivalent token utility)
- **AND** no hard-coded hex literal appears in `CardPips.tsx`
