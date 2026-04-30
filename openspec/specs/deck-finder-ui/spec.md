# deck-finder-ui Specification

## Purpose
TBD - created by archiving change add-deck-finder. Update Purpose after archive.
## Requirements
### Requirement: Decks page hosts a Saved / Finder tab strip

`apps/desktop/src/renderer/src/components/DecksPage.tsx` SHALL
render a tab strip with two tabs: "Saved" and "Finder".

The default active tab on a fresh page mount MUST be "Saved" so
the existing user flow from `add-deck-management` is preserved.

The "Saved" tab MUST mount the existing saved-decks list / editor /
import-export UI unchanged (its source moves to a sibling
`SavedDecksTab.tsx`).

The "Finder" tab MUST mount the new `DeckFinderTab` component.

The tab strip MUST be keyboard navigable (Radix Tabs primitives or
equivalent ARIA roles).

#### Scenario: Default tab is Saved

- **WHEN** the user navigates to `/decks` for the first time in a
  session
- **THEN** the "Saved" tab is active
- **AND** the saved-decks list / empty-state renders

#### Scenario: Switching to Finder mounts the Finder

- **GIVEN** the page is on the Saved tab
- **WHEN** the user clicks the "Finder" tab trigger
- **THEN** the Finder content renders
- **AND** the saved-decks list is no longer in the document

#### Scenario: Switching back preserves Saved state

- **GIVEN** the user is on the Finder tab
- **WHEN** the user clicks back to "Saved"
- **THEN** the saved-decks list re-renders from its store

### Requirement: DeckFinderTab header

`DeckFinderTab` SHALL render a header containing:

- An eyebrow chip with `decks.finder.eyebrow` (e.g. "DECKS / FIND")
  in monospace, small caps, accent muted color.
- A title with `decks.finder.title` (e.g. "Deck Finder") at H2 size
  weight 600.
- A right-aligned count chip
  `<filteredCount> of <totalCount> decks · indexed <totalCount>`
  where `totalCount` is `seed.length` and `filteredCount` reflects
  the current criteria.

#### Scenario: Header shows filtered count

- **GIVEN** the seed has 14 entries and the user has typed
  `Fireball` in the includes-card input
- **WHEN** the filter narrows to 3 entries
- **THEN** the header reads "3 of 14 decks · indexed 14"

#### Scenario: Header copy follows active locale

- **GIVEN** the active locale is `zh-CN`
- **WHEN** the Finder mounts
- **THEN** the eyebrow and title render in Chinese (from
  `decks.finder.eyebrow` and `decks.finder.title`)

### Requirement: DeckFinderTab filter rows

`DeckFinderTab` SHALL render four filter controls that all feed
into a single `PopularDeckFilterCriteria` driving the visible list:

1. Includes-card text input. On non-empty input, the Finder lazily
   resolves card names per deck via `window.hdt.cards.findByDbfId`
   (cached across keystrokes) before applying the substring match.
2. Excludes-card text input (same resolution / cache as above).
3. Format pills covering `Standard`, `Wild`, `Classic`, `Twist`.
   Exactly one pill is selected at a time. Default: `Standard`.
4. Class chips: an `ALL CLASSES` chip plus per-class chips for the
   11 playable classes (excluding `NEUTRAL`). Default: `ALL CLASSES`.
5. Archetype filter row: `All`, `Aggro`, `Midrange`, `Control`,
   `Combo`, `Tempo`, `Ramp`. Default: `All`.
6. Subfilter row: a max-dust slider (range `1000`-`20000`, step
   `500`, default `20000`) AND a sort selector with options
   `Popular`, `Winrate`, `Updated`, `Cheapest`. Default sort:
   `Popular`.

A control's selected state MUST be visually distinguished via the
existing `bg-accent-dim` / `border-accent` token utilities.

While the CardDb is not yet ready (`window.hdt.cards.findByDbfId`
unavailable), the includes / excludes inputs MUST be disabled with
a localized "indexing cards…" hint.

#### Scenario: Class chip narrows the list

- **GIVEN** the Finder shows 14 entries (ALL CLASSES selected)
- **WHEN** the user clicks the MAGE class chip
- **THEN** every visible row has `class === 'MAGE'`
- **AND** the count chip updates to `<n> of 14 decks · indexed 14`

#### Scenario: Includes-card input filters by name

- **GIVEN** the CardDb is ready and at least one seed deck contains
  Fireball
- **WHEN** the user types `Fire` in the includes-card input
- **THEN** every visible row's deck contains a card whose name
  matches `Fire` case-insensitive

#### Scenario: Format pills are mutually exclusive

- **GIVEN** the user has selected the Standard pill
- **WHEN** the user clicks the Wild pill
- **THEN** Wild is selected
- **AND** Standard is NOT selected

#### Scenario: Sort is reflected in the list order

- **WHEN** the user picks `Cheapest` from the sort selector
- **THEN** the visible rows are non-strictly ascending in
  `dustCost`

#### Scenario: CardDb-not-ready state disables card inputs

- **GIVEN** `window.hdt.cards.findByDbfId` is undefined
- **WHEN** the Finder mounts
- **THEN** both the includes-card and excludes-card inputs are
  disabled
- **AND** a localized "indexing cards…" hint is visible

### Requirement: DeckFinderTab list and detail panes

The Finder body SHALL render a 1.4fr / 1fr grid:

- Left: a vertically scrollable list of `PopularDeckRow` components,
  one per filtered+sorted deck, separated by `border-border`.
- Right: a `PopularDeckDetail` for the currently selected deck (or
  the first deck in the list, if none has been clicked yet).

A row MUST render: class crest icon, deck name, secondary metadata
line "<archetype> · by <author> · upd <updatedAgo>", and a right-
aligned winrate% (color-coded green ≥55, accent ≥50, amber <50)
plus games count (e.g. "12.4k games").

The detail pane MUST render:

- Class crest + deck name + secondary metadata header.
- A 3-cell KPI strip: WINRATE (% with color rule above), GAMES
  (rounded, e.g. "12.4k"), DUST (with "◆" prefix).
- A `ManaCurveChart` mini SVG over the 8 cost buckets.
- A "KEY CARDS" list: each row is `mana gem + card name + pip count`
  for the deck's distinct cards, capped at 12 entries.
- Two action buttons:
  - Primary: "IMPORT TO MY DECKS" — calls
    `window.hdt.decks.importDeckstring(deckstring)`, then switches
    the parent Decks page tab to "Saved" and opens the Editor on
    the new deck.
  - Secondary: "COPY CODE" — calls `navigator.clipboard.writeText(deckstring)`,
    then transiently shows a "Copied" pill on the button for ≥1 s.

#### Scenario: Empty filtered list

- **GIVEN** filters narrow the list to zero entries
- **WHEN** the body renders
- **THEN** the list pane shows a localized empty state
  ("No decks match. Loosen a filter.")
- **AND** the detail pane shows a localized empty state

#### Scenario: First deck is auto-selected on mount

- **GIVEN** the Finder mounts with a non-empty filtered list
- **WHEN** the user has not clicked any row
- **THEN** the detail pane renders the first row's deck

#### Scenario: Clicking a row updates the detail pane

- **GIVEN** the user is on row 0 (auto-selected)
- **WHEN** the user clicks row 2
- **THEN** the detail pane re-renders for row 2's deck

#### Scenario: IMPORT button creates a saved deck

- **GIVEN** the user is on a deck with deckstring `D`
- **WHEN** the user clicks "IMPORT TO MY DECKS"
- **THEN** `window.hdt.decks.importDeckstring(D)` is invoked once
- **AND** the parent Decks page tab switches to "Saved"
- **AND** the editor opens on the newly-imported deck

#### Scenario: COPY CODE writes to clipboard and confirms

- **GIVEN** the user is on a deck with deckstring `D`
- **WHEN** the user clicks "COPY CODE"
- **THEN** `navigator.clipboard.writeText(D)` is invoked once
- **AND** a "Copied" confirmation appears on the button for at
  least 1 second

### Requirement: ManaCurveChart mini SVG

`apps/desktop/src/renderer/src/components/ManaCurveChart.tsx` SHALL
render an inline SVG bar chart of an 8-cell numeric array.

The component takes `{ buckets: readonly number[]; width?: number;
height?: number; ariaLabel?: string }`.

Bars MUST be rendered with the `--accent` token color, sized
proportionally to the max bucket value, with at least 1px minimum
height for non-zero buckets so single-card buckets stay visible.

The SVG root MUST have `role="img"` and an `aria-label` that
defaults to a localized "Mana curve" string.

#### Scenario: Empty curve renders without error

- **GIVEN** `buckets = [0, 0, 0, 0, 0, 0, 0, 0]`
- **WHEN** `ManaCurveChart` renders
- **THEN** no exception is thrown
- **AND** all 8 bars are present at zero height

#### Scenario: Non-zero buckets get at least 1px height

- **GIVEN** `buckets = [0, 0, 0, 0, 0, 0, 0, 1]`
- **WHEN** `ManaCurveChart` renders with height 48
- **THEN** the bar at index 7 has height ≥ 1

### Requirement: Finder tokens regression

All new Finder components MUST consume the existing Console theme
token utilities (`bg-bg`, `bg-bg-2`, `bg-bg-3`, `text-text`,
`text-text-dim`, `text-text-mute`, `text-accent`, `bg-accent`,
`bg-accent-dim`, `border-border`, `border-border-hi`, `font-mono`,
etc.) as introduced by `add-console-theme-tokens`.

Hard-coded color literals in arbitrary-value Tailwind utilities
(`bg-[#...]`, `text-[#...]`, etc.) or inline `style={{ color: '#...' }}`
are forbidden.

#### Scenario: Token grep regression

- **WHEN** the project's `tests/theme-tokens-grep.test.ts` (or
  equivalent regression) is run after this change merges
- **THEN** no new bare-hex literals appear in any of:
  `DeckFinderTab.tsx`, `PopularDeckRow.tsx`, `PopularDeckDetail.tsx`,
  `ManaCurveChart.tsx`, `SavedDecksTab.tsx`

