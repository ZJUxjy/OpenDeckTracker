## ADDED Requirements

### Requirement: TrackerPanelTabs container component

A new component `apps/desktop/src/renderer/src/components/TrackerPanelTabs.tsx` SHALL accept the props `{ deckSlot: ReactNode; effectsSlot: ReactNode; effectsCount: number; side: 'player' | 'opponent' }` and render a two-tab vertical container.

The container MUST:

- Render a thin tab strip at the top of its bounding box (max
  height 32 px) with two tabs labelled via the active i18n locale:
  `globalEffects.tabDeck` and `globalEffects.tabEffects`.
- Default the active tab to `Deck` on every mount (no localStorage
  persistence).
- Show a numeric badge on the `Effects` tab when `effectsCount > 0`,
  expressed via Console theme tokens (`bg-accent text-bg`).
- Render `deckSlot` when the active tab is `Deck`; render
  `effectsSlot` when active is `Effects`. Inactive slot's React
  subtree MUST stay mounted (display: none) so per-row state in
  the deck panel — hover targets, animation timers, image refs —
  survives a tab toggle.
- Express every chrome color via Console theme tokens. No
  hard-coded hex literals.

#### Scenario: Default tab is Deck

- **WHEN** `<TrackerPanelTabs ... />` mounts for the first time
- **THEN** the `Deck` tab pill carries the `data-active="true"`
  marker
- **AND** the `effectsSlot` element is in the DOM with `aria-hidden`
  and zero visible height

#### Scenario: Effects badge shows count when non-zero

- **GIVEN** `effectsCount === 3`
- **WHEN** the panel renders
- **THEN** the Effects tab pill contains a child element rendering
  the text `3`
- **WHEN** `effectsCount === 0` is passed in a re-render
- **THEN** the badge element is no longer present in the DOM

#### Scenario: Switching tabs preserves deck panel state

- **GIVEN** the user has hovered a `card-copy-row` causing the
  card-preview window to open
- **WHEN** the user clicks the `Effects` tab and then the `Deck`
  tab
- **THEN** the row hover handlers are still bound (no remount) and
  the deck panel's animation timers from the just-played card are
  uninterrupted

### Requirement: GlobalEffectsPanel component

A new component `apps/desktop/src/renderer/src/components/GlobalEffectsPanel.tsx` SHALL render a vertical list of `ActiveEffect` entries for one side.

The component MUST:

- Accept the props `{ effects: ActiveEffect[]; side: 'player' |
  'opponent' }` and read no other Zustand selectors.
- For each entry, render a `GlobalEffectRow` showing:
  1. The source card's tile art (via existing `useCardTileUrl`),
     same caching pipeline as `LiveDeckPanel`.
  2. A localized title resolved from `globalEffects.<id>.title`.
  3. A localized one-sentence body resolved from
     `globalEffects.<id>.body`.
  4. If `params` is present, an effect-specific params region
     (e.g. for `tame-pet`: three `card-row-art` images of the
     resolved beast pool, ordered as in `params.pool`).
- Order entries by `triggeredAt ascending` — earliest first.
- Render an empty state via `globalEffects.emptyTitle` +
  `globalEffects.emptyBody` when `effects.length === 0`.
- Apply Console theme tokens for every color and use the `font-mono`
  utility for any numeric text (timestamps, parameter counters).

#### Scenario: Empty state when no effects active

- **GIVEN** `effects: []`
- **WHEN** the panel renders
- **THEN** the panel shows the localized empty title and empty body
- **AND** no `data-testid="global-effect-row"` elements are present

#### Scenario: Cleansing Cleric row renders without params region

- **GIVEN** an `effects` array containing one entry with
  `id === 'cleansing-cleric'` and `params === undefined`
- **WHEN** the panel renders
- **THEN** exactly one `data-testid="global-effect-row"` element
  is present
- **AND** the row contains text resolved from
  `globalEffects.cleansing-cleric.title` and
  `globalEffects.cleansing-cleric.body`
- **AND** no params region is present

#### Scenario: Tame Pet row renders the beast pool when params present

- **GIVEN** an `effects` array containing one entry with
  `id === 'tame-pet'` and
  `params === { pool: ['CS3_022', 'CS3_023', 'CS3_024'] }`
- **WHEN** the panel renders
- **THEN** the row contains a params region with exactly three
  `card-row-art` images whose `src` resolves through the
  `hdt-card-image://tile/` protocol
- **AND** their order matches `params.pool`

#### Scenario: Tame Pet row degrades to no params region when
       params absent

- **GIVEN** an `effects` array containing one entry with
  `id === 'tame-pet'` and `params === undefined`
- **WHEN** the panel renders
- **THEN** the row still renders title and body
- **AND** no params region is present

### Requirement: TrackerPanelTabs integration in routes and overlays

`apps/desktop/src/renderer/src/routes.tsx` SHALL wrap the right-rail
`<LiveDeckPanel />` and `<OpponentCardsPanel />` in
`<TrackerPanelTabs />` containers, each receiving its side's
effects from the Zustand store.

`apps/desktop/src/renderer/src/components/OverlayView.tsx` SHALL
wrap its `<LiveDeckPanel />` in a `<TrackerPanelTabs />` configured
with `side='player'`.

`apps/desktop/src/renderer/src/components/OpponentOverlayView.tsx`
SHALL wrap its `<OpponentCardsPanel />` in a `<TrackerPanelTabs />`
configured with `side='opponent'`.

#### Scenario: Player overlay exposes both tabs

- **WHEN** the `/overlay` route renders `OverlayView`
- **THEN** the rendered tree contains both
  `data-testid="tracker-tab-deck"` and
  `data-testid="tracker-tab-effects"` elements

#### Scenario: Opponent overlay exposes both tabs

- **WHEN** the `/overlay-opponent` route renders
  `OpponentOverlayView`
- **THEN** the rendered tree contains both
  `data-testid="tracker-tab-deck"` and
  `data-testid="tracker-tab-effects"` elements

#### Scenario: Main window Tracker route exposes both tabs per
       side

- **WHEN** the `/tracker` route renders
- **THEN** the right-rail contains two distinct
  `TrackerPanelTabs` instances, one with `side='player'` and one
  with `side='opponent'`

### Requirement: i18n keys for global effects UI

Both locale files (`resources/locales/en-US.json` and `resources/locales/zh-CN.json`) SHALL each contain a `globalEffects` namespace with at minimum:

- `tabDeck` — label for the Deck tab.
- `tabEffects` — label for the Effects tab.
- `emptyTitle`, `emptyBody` — empty-state strings.
- For every catalog `EffectDef.id`: `<id>.title` and `<id>.body`.

The two locale files MUST agree on the full set of keys (no
locale-specific extras, no missing keys).

#### Scenario: en-US and zh-CN have the same key set

- **WHEN** the locale-parity test enumerates `globalEffects.*`
  paths in both files
- **THEN** the two key sets are equal

#### Scenario: Every catalog entry has paired title and body
       strings in both locales

- **WHEN** the catalog-parity test joins `EFFECT_CATALOG` ids
  against locale keys
- **THEN** every id resolves to a non-empty string for
  `globalEffects.<id>.title` and `globalEffects.<id>.body` in both
  `en-US` and `zh-CN`
