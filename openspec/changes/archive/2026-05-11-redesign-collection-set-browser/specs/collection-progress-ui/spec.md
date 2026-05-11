## ADDED Requirements

### Requirement: Collection route is a two-view navigable surface

The Collection route SHALL render one of two views at a time: a Set
Grid (default) and a Set Detail drilldown. The active view is selected
by an internal `selectedSetCode: string | null` state — `null` shows
the grid; any non-null value shows the detail view for that set code.

Navigating between views MUST NOT navigate the surrounding app routes
or unmount the existing collection data fetch. The grid view's data
(`collection.getProgress()` result and the card-db chip count) MUST
remain cached across drilldown round-trips so returning from the
detail view is instant.

#### Scenario: Clicking a set tile opens the detail view

- **GIVEN** the Set Grid is rendered
- **WHEN** the user clicks the tile for `SET_1810`
- **THEN** the Set Detail view for `SET_1810` is shown
- **AND** the grid is no longer visible
- **AND** the surrounding app navigation (sidebar selection) does
  not change

#### Scenario: Detail back-navigation returns to the grid

- **GIVEN** the Set Detail view for `SET_1810` is shown
- **WHEN** the user clicks the detail header back button
- **THEN** the Set Grid view is shown again
- **AND** the grid renders without re-fetching
  `collection.getProgress()`

### Requirement: Set Grid uses a 5-column tile layout

The Set Grid view SHALL render set tiles in a 5-column responsive
grid. Each tile MUST:

- Use the `tahoe-card` surface treatment.
- Show an art header band whose background color is keyed off the
  set's primary class accent (`--class-*` tokens) or, for
  multi-class / neutral sets, `--class-neutral`. The set's localized
  name from `SET_LABELS[code][activeLocale]` overlays the band; if
  the set is a Mini-Set, a small `MINI-SET` badge appears below the
  name.
- Show an info area below the art band with two stat rows:
  - **唯一卡牌** label + `ownedUniqueCards / totalCards` value.
  - **总收藏数** label + `ownedCopies / totalCopies` value.
  The value uses `--semantic-success` when owned equals total,
  `--semantic-danger` when owned is zero, and `--semantic-warning`
  for partial states.
- Show a thin progress bar at the bottom of the info area driven by
  `ownedUniqueCards / totalCards`. The bar uses `--accent` while
  partial and `--semantic-success` at completion.
- Render a Complete badge in the top-left corner of the art band when
  `ownedCopies === totalCopies && totalCopies > 0`.

The grid container MUST collapse to fewer columns at narrow widths
(at least 4 columns at `lg` breakpoint, 2 columns below `md`) to
preserve readability on smaller windows.

#### Scenario: Tile renders dual stat values

- **GIVEN** a `SetProgress` row with `ownedUniqueCards = 254`,
  `totalCards = 263`, `ownedCopies = 110`, `totalCopies = 526`
- **WHEN** the tile renders
- **THEN** the `唯一卡牌` row shows `254 / 263`
- **AND** the `总收藏数` row shows `110 / 526` in
  `--semantic-warning` color

#### Scenario: Tile collapses columns on narrow viewports

- **GIVEN** the viewport width is below the `md` breakpoint
- **WHEN** the Set Grid renders
- **THEN** the grid uses at most 2 columns
- **AND** all stat rows and the progress bar remain readable

#### Scenario: Mini-Set tile shows the MINI-SET badge

- **GIVEN** a `SetProgress` row for a mini-set
- **WHEN** the tile renders
- **THEN** a `MINI-SET` badge appears in the art band

### Requirement: Set Grid tab bar shows all collection categories

The Set Grid view SHALL render a tab bar above the filter row with
exactly five tabs in this order: `卡牌`, `卡背图案`, `英雄`,
`幸运币`, `卡牌包` (with localized English labels under `en-US`).

Only the `卡牌` tab MUST be active and interactive. The four other
tabs MUST render with a `未开放` chip and MUST NOT respond to clicks.
Clicking a disabled tab MUST NOT change the route, swap the grid
content, or fire any IPC.

#### Scenario: Disabled tabs render unchanged

- **GIVEN** the Set Grid is rendered
- **WHEN** the user clicks the `卡背图案` tab
- **THEN** the active tab stays `卡牌`
- **AND** the grid content is unchanged

#### Scenario: Tab labels follow the active locale

- **GIVEN** the active locale is `en-US`
- **WHEN** the tab bar renders
- **THEN** the tabs read `Cards / Card Backs / Heroes / Lucky Coins
  / Card Packs` in that order
- **AND** the `未开放` chip becomes `Coming Soon`

### Requirement: Set Grid filter row

The Set Grid view SHALL render a filter row between the tab bar and
the overall progress card with:

- A **mode** dropdown (`全部模式 / 标准 / 狂野`) that filters the grid
  to one format only (when `全部模式` is selected, both Standard and
  Wild sets are interleaved in the grid).
- A **search** input that filters tiles by localized set name
  substring (case-insensitive).

The existing Standard / Wild segmented control on the overall
progress card is retained alongside the dropdown — the segmented
control continues to drive which array (`response.standard` vs
`response.wild`) feeds the overall progress bar, while the dropdown
filters the *grid* below it.

#### Scenario: Search filters tiles by localized name

- **GIVEN** the active locale is `zh-CN`
- **WHEN** the user types `天堂` into the search input
- **THEN** only sets whose `SET_LABELS[code]['zh-CN']` contains `天堂`
  are visible in the grid

#### Scenario: Mode dropdown filters the grid

- **GIVEN** the mode dropdown is set to `狂野`
- **WHEN** the grid renders
- **THEN** every tile corresponds to a row with `format: 'wild'`

### Requirement: Set Detail header

The Set Detail view SHALL render a header row containing:

- A back-button control on the left.
- A 52×52 px set logo (the colored art band reused from the tile, no
  text — set name moves to the title position).
- The localized set name as the primary title, with a `MINI-SET`
  badge beside it if applicable.
- A subtitle line showing the English set name and the total card
  count (e.g. `Into the Emerald Dream · 共 72 张`).
- A right-aligned progress summary: large `ownedUniqueCards` in
  `--accent` (or `--semantic-success` when complete) and a smaller
  `/ totalCards 唯一` suffix in `--text-tertiary`.
- A `套装已完成` pill in `--semantic-success` when
  `ownedCopies === totalCopies`.

Clicking the back button MUST return the user to the Set Grid view
(see "Collection route is a two-view navigable surface").

#### Scenario: Complete set shows completion pill

- **GIVEN** the detail view for a `SetProgress` with
  `ownedCopies === totalCopies`
- **WHEN** the header renders
- **THEN** a green `套装已完成` pill is visible in the right
  side of the header

### Requirement: Set Detail card grid uses a 5-column layout

The Set Detail view SHALL render the cards in the set in a 5-column
grid. Each cell MUST render a `CollectionCardCell` (see "Card cell
visual states") fed by the result of
`cards.search({ set: <code>, collectible: true })` cross-referenced
with the most recent `CollectionProgressResponse` owned counts.

The grid MUST collapse to fewer columns at narrow widths (at least 4
columns at `lg`, 3 at `md`, 2 below `md`).

Each card image MUST be loaded through `cardImages.get(cardId)` (the
local cache); the renderer MUST NOT directly request CDN URLs.

#### Scenario: Detail grid shows every collectible card in the set

- **GIVEN** the set `SET_1810` has 362 collectible cards
- **WHEN** the detail view for `SET_1810` opens
- **THEN** 362 card cells render in the grid

#### Scenario: Detail card image goes through the cache

- **WHEN** any card cell mounts
- **THEN** the image source resolves from `cardImages.get(cardId)`
- **AND** no direct CDN URL appears in the cell's `<img src>`

### Requirement: Set Detail filter row

The Set Detail view SHALL render a filter row between the header and
the card grid with:

- A **rarity** dropdown (`任意稀有度 / 普通 / 稀有 / 史诗 / 传说`).
- A **class** dropdown (`所有职业` + the 11 Hearthstone classes +
  `中立`).
- A **type** dropdown (`全部类型 / 随从 / 法术 / 武器 / 地标`).
- A **mana cost** pill group with `全部` + buttons `1, 2, 3, 4, 5, 6,
  7+`. Exactly one pill is active at a time. Clicking the active
  pill again deselects (returning to `全部`).
- A **search** input for card-name substring.

All filters MUST be ANDed together and applied client-side to the
already-fetched card list. The filter state MUST reset whenever
`selectedSetCode` changes (i.e. when the user opens a different set).

#### Scenario: Mana pill filters cards to the selected cost

- **GIVEN** the set detail is open and the mana pill `2` is active
- **WHEN** the grid renders
- **THEN** every visible card cell has `cost === 2`

#### Scenario: Mana pill `7+` filters cards with cost 7 or higher

- **GIVEN** the mana pill `7+` is active
- **WHEN** the grid renders
- **THEN** every visible card cell has `cost >= 7`

#### Scenario: Filters reset on set change

- **GIVEN** the detail view has the rarity dropdown set to `传说` and
  the mana pill `5` active
- **WHEN** the user navigates back to the grid and opens a different
  set
- **THEN** the rarity dropdown reads `任意稀有度`
- **AND** the mana pill `全部` is active

### Requirement: Card cell visual states

A `CollectionCardCell` SHALL render the following elements stacked
vertically:

- The full card render image (250×280 px nominal aspect) loaded via
  `cardImages.get(cardId)`.
- Below the image, a footer row with:
  - **Owned badge** on the left: `收藏 x{owned}/{max}` where `max`
    comes from `maxCopiesForRarity(card.rarity)`. The badge color is
    `--semantic-success` when `owned === max`, `--semantic-warning`
    when `0 < owned < max`, and `--semantic-danger` when
    `owned === 0`.
  - **Dust chip** on the right: a small cyan rhombus icon followed
    by the dust value from `dustValueForRarity(card.rarity)`.

Cards the player does not own (`owned === 0`) MUST render with a
semi-transparent black overlay over the card image AND a centered
white pill containing the localized `未拥有` label. The mana cost
gem, attack/health bubbles, and other card-art details MUST remain
visible through the overlay (i.e. the overlay sits between the card
art and the lock pill but below text outside the image).

#### Scenario: Fully owned card shows green badge, no overlay

- **GIVEN** a card with rarity `RARE` and `owned === 2`
- **WHEN** the cell renders
- **THEN** the owned badge reads `收藏 x2/2` in
  `--semantic-success`
- **AND** no dim overlay is present
- **AND** the dust chip reads `100`

#### Scenario: Partial ownership shows amber badge

- **GIVEN** a card with rarity `EPIC` and `owned === 1`
- **WHEN** the cell renders
- **THEN** the owned badge reads `收藏 x1/2` in
  `--semantic-warning`
- **AND** the dust chip reads `400`

#### Scenario: Unowned card shows dim overlay and lock pill

- **GIVEN** a card with rarity `LEGENDARY` and `owned === 0`
- **WHEN** the cell renders
- **THEN** the card image is overlaid by a translucent black layer
- **AND** a `未拥有` pill is centered over the image
- **AND** the owned badge reads `收藏 x0/1` in
  `--semantic-danger`
- **AND** the dust chip reads `1600`

### Requirement: Rarity → max-copies and dust helpers in `@hdt/core`

`packages/core/src/collection/dust.ts` SHALL export:

- `maxCopiesForRarity(rarity: Rarity): number` returning `1` for
  `LEGENDARY` and `2` for every other rarity.
- `dustValueForRarity(rarity: Rarity): number` returning the standard
  Hearthstone disenchant value: `40` (COMMON), `100` (RARE), `400`
  (EPIC), `1600` (LEGENDARY), `0` (FREE / unknown).

Both helpers MUST be pure and MUST NOT depend on renderer scaffolding
so they can be exercised by unit tests in the `@hdt/core` package
without spinning up Vitest's jsdom environment.

#### Scenario: Legendary cards are capped at 1 copy

- **WHEN** `maxCopiesForRarity('LEGENDARY')` is called
- **THEN** it returns `1`

#### Scenario: Standard rarities map to standard dust values

- **WHEN** `dustValueForRarity` is called with `COMMON`, `RARE`,
  `EPIC`, `LEGENDARY` in order
- **THEN** it returns `40`, `100`, `400`, `1600` respectively

### Requirement: Localized strings for the new UI

Every user-visible string introduced by this capability SHALL resolve
through the active i18n locale via `useTranslation()` and MUST appear
in both `resources/locales/en-US.json` and `resources/locales/zh-CN.json`.

The affected strings include: tab labels (`卡牌` etc.), the
`未开放 / Coming Soon` chip, filter labels (`任意稀有度`, `所有职业`,
`全部类型`, `全部`, `7+`), the `MINI-SET` badge text, the detail-header
subtitle pattern (e.g. `... · 共 N 张`), the `套装已完成` pill, the
`未拥有` lock pill, the `收藏 x{owned}/{max}` badge format, and the
`唯一卡牌` / `总收藏数` tile stat labels.

No new string MUST be hard-coded inline in the rendered JSX.

#### Scenario: English locale renders detail subtitle in English

- **GIVEN** the active locale is `en-US`
- **WHEN** the detail header for a 72-card set renders
- **THEN** the subtitle reads in the form
  `Into the Emerald Dream · 72 cards`
