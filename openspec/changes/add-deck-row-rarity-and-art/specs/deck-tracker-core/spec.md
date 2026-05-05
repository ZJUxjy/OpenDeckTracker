## ADDED Requirements

### Requirement: Rarity-to-token mapping is centralized in lib/rarity.ts

`apps/desktop/src/renderer/src/lib/rarity.ts` (NEW) SHALL export pure helpers that map a `Rarity | undefined` value (from `@hdt/hearthdb`'s `CardDef.rarity`) to Console rarity tokens, so both `LiveDeckPanel` row variants — and any future rarity-bearing UI — share one source of truth.

The module MUST export at minimum:

- `getRarityToken(rarity?: Rarity): string` — returns the CSS custom-property name (e.g. `'--rarity-legendary'`) for a given rarity. `undefined` and unrecognized values MUST resolve to `'--rarity-common'`.
- `getRarityCostBg(rarity?: Rarity): string` — returns the Tailwind utility class string for the cost-cell tint (e.g. `'bg-rarity-legendary text-bg'`). The text-color portion MUST resolve to a token whose contrast against the background tint passes legibility review (dark text on bright tints, light text on the dark `--rarity-free` tint).

The module MUST NOT call any browser APIs and MUST be importable from any renderer module. Both row components MUST consume `getRarityCostBg` rather than constructing rarity utility strings inline.

#### Scenario: getRarityToken maps each rarity

- **WHEN** `getRarityToken('LEGENDARY')` is called
- **THEN** it returns `'--rarity-legendary'`
- **AND** `getRarityToken('FREE')` returns `'--rarity-free'`
- **AND** `getRarityToken('COMMON')` returns `'--rarity-common'`
- **AND** `getRarityToken('RARE')` returns `'--rarity-rare'`
- **AND** `getRarityToken('EPIC')` returns `'--rarity-epic'`

#### Scenario: getRarityToken falls back for missing rarity

- **WHEN** `getRarityToken(undefined)` is called
- **THEN** it returns `'--rarity-common'`

#### Scenario: getRarityCostBg returns a token-only utility string

- **WHEN** `getRarityCostBg('LEGENDARY')` is called
- **THEN** the returned string contains `bg-rarity-legendary`
- **AND** the returned string contains a `text-*` utility that resolves to a Console token (no raw hex / palette literal)

## MODIFIED Requirements

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
- Tint each row's cost cell by the card's rarity using `getRarityCostBg(def?.rarity)` (from `lib/rarity.ts`). Cards without a known rarity MUST use the `--rarity-common` tint.
- Render the card portrait as an inline `<img>` element on the right side of each row, sourced from `useCardTileUrl(cardId)` (a hook that returns the locally-cached `hdt-card-image://tile/<cardId>.png` URL once the main-process tile cache populates, falling back to the CDN URL `https://art.hearthstonejson.com/v1/orig/<cardId>.png` only on first paint). The portrait MUST source from the frame-less `/v1/orig/` endpoint — NOT `/v1/render/...` (full card with frame / gem / banner) and NOT `/v1/tiles/...` (which ships a baked-in left-side fade designed for HS's UI and produces a visible white edge in our rows). `/v1/256x/` is acceptable as a smaller alternative; `/v1/orig/` is preferred for HiDPI / 4K visual fidelity since the disk cache amortizes the larger file size. The portrait element MUST carry `data-testid="card-row-art"` for testability. Bare CDN URLs MUST NOT remain in steady state — once the cache resolves, the rendered `<img src>` MUST be a `hdt-card-image://tile/...` URL.
- Apply a CSS `mask-image: linear-gradient(to right, transparent 0%, black 55%, black 100%)` (with `-webkit-mask-image` fallback) to the portrait `<img>` so the image's own left edge fades into transparency, blending smoothly with the row's background. A separate `<div>` gradient overlay MUST NOT be used — it produces a visible hard seam against bright artwork.
- Apply a text shadow on the row's name text so it stays legible over busy artwork (the exact shadow value MAY be tuned but MUST be present).

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

#### Scenario: Cost cell tints by rarity

- **GIVEN** a row whose card def reports `rarity === 'LEGENDARY'`
- **WHEN** the row renders
- **THEN** the cost cell carries the `bg-rarity-legendary` utility (or an equivalent class string returned by `getRarityCostBg`)

#### Scenario: Cost cell falls back when rarity is unknown

- **GIVEN** a row whose card def has no `rarity` field
- **WHEN** the row renders
- **THEN** the cost cell carries the `bg-rarity-common` utility

#### Scenario: Card portrait renders on each row

- **GIVEN** a row with a known cardId
- **WHEN** the row renders
- **THEN** the row contains an `<img>` element with `data-testid="card-row-art"` whose `src` is either `https://art.hearthstonejson.com/v1/orig/<cardId>.png` (first paint) or `hdt-card-image://tile/<cardId>.png` (cache resolved)
- **AND** the `src` MUST NOT contain `/render/` (full-frame is reserved for the hover popover) nor `/tiles/` (baked-in left fade)

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
- Tint the cost cell of each non-spent row by rarity using
  `getRarityCostBg(def?.rarity)` (same helper as the desktop variant).
- Render the card portrait as an inline `<img>` element on the right
  side of each row, sourced from `useCardTileUrl(cardId)` (the same
  cache-first tile hook the desktop variant uses), carrying
  `data-testid="card-row-art"`. The pip widget MUST visually sit
  above the portrait + gradient layer so its filled/hollow dots stay
  readable.
- Apply the same CSS `mask-image` left-edge fade as the desktop
  variant (transparent at 0% → opaque at 55%) so the portrait
  blends smoothly into the row background. A separate gradient
  `<div>` overlay MUST NOT be used.
- For spent rows (`remaining === 0`), the row's existing
  reduced-opacity treatment MUST visually fade the portrait alongside
  the rest of the row (no separate portrait fade is required).

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
- **WHEN** the compact variant renders the row
- **THEN** the pip widget shows two dots, the first filled and the second hollow

#### Scenario: Compact row tints cost cell by rarity

- **GIVEN** a compact-variant row whose card def reports `rarity === 'EPIC'`
- **WHEN** the row renders
- **THEN** the cost cell carries the `bg-rarity-epic` utility (or an equivalent class string returned by `getRarityCostBg`)

#### Scenario: Compact row renders the card portrait

- **GIVEN** a compact-variant row with cardId `EX1_277`
- **WHEN** the row renders
- **THEN** the row contains an `<img>` element with `data-testid="card-row-art"` whose `src` is either `https://art.hearthstonejson.com/v1/orig/EX1_277.png` (first paint) or `hdt-card-image://tile/EX1_277.png` (cache resolved)
- **AND** the `src` MUST NOT contain `/render/` nor `/tiles/`

#### Scenario: Spent compact row keeps the portrait but is faded

- **GIVEN** a compact-variant row with `remaining === 0`
- **WHEN** the row renders
- **THEN** the row's wrapping element carries the `opacity-40` class
- **AND** the row still contains an `<img data-testid="card-row-art">` element (faded by inheriting the wrapper's opacity)
