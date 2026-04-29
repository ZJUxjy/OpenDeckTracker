## ADDED Requirements

### Requirement: Renderer exposes an appearance store

The renderer SHALL provide a Zustand store at
`apps/desktop/src/renderer/src/stores/appearance-store.ts` that owns the
two presentation preferences governed by this capability:

| Field      | Type                                  | Default        |
|------------|---------------------------------------|----------------|
| `density`  | `'comfortable' \| 'compact'`          | `'comfortable'`|
| `accent`   | `'cyan' \| 'teal' \| 'violet'`        | `'cyan'`       |

The store MUST:

- Read its initial state from `localStorage` key `hdt.appearance`
  (JSON-encoded). Missing key, malformed JSON, or unknown enum values
  fall back to the defaults silently.
- Persist every preference change to `localStorage` synchronously and
  swallow storage errors (mirroring the existing `useI18nStore` pattern).
- Expose `setDensity(next)` and `setAccent(next)` mutators that update
  in-memory state and write through to storage.
- Export a frozen `ACCENT_PALETTE` map keyed by the accent id and
  yielding the corresponding `--accent` and `--accent-dim` CSS values
  exactly as authored in the design document. The Settings UI and the
  apply-effect MUST consume this map; no swatch may be hard-coded
  outside it.

#### Scenario: Defaults when nothing is stored

- **WHEN** the store initializes and `localStorage` has no
  `hdt.appearance` key
- **THEN** `density === 'comfortable'` and `accent === 'cyan'`

#### Scenario: Persisted preferences round-trip

- **GIVEN** a previous session set `density: 'compact'` and
  `accent: 'violet'`
- **WHEN** the renderer reloads
- **THEN** the store reads `density: 'compact'` and `accent: 'violet'`
  from `localStorage`

#### Scenario: Malformed storage falls back

- **GIVEN** `localStorage.hdt.appearance === '{ this is not json'`
- **WHEN** the store initializes
- **THEN** `density === 'comfortable'` and `accent === 'cyan'` and
  no exception escapes the store module

### Requirement: Appearance preferences are live-applied to the renderer root

The renderer SHALL apply the current appearance preferences to
`document.documentElement` exactly once at app start AND after every
preference change, with no full reload.

The apply-effect MUST:

- Set the attribute `data-density` on `document.documentElement` to the
  current density value.
- Set the inline CSS custom properties `--accent` and `--accent-dim` on
  `document.documentElement` using the `ACCENT_PALETTE` entry for the
  current accent value.
- Run inside the React tree, mounted near `apps/desktop/src/renderer/src/main.tsx`,
  so it has access to the store and is removed cleanly during teardown.

`apps/desktop/src/renderer/src/styles/theme.css` SHALL contain density
overrides keyed off `[data-density="compact"]` that reduce padding on
the chrome row classes used by Settings rows, KPI cards, and recent-
match list items, and SHALL NOT alter padding on gameplay-critical
surfaces (`LiveDeckPanel`, `OpponentCardsPanel`, `Decklist`).

#### Scenario: Setting accent updates DOM custom properties

- **GIVEN** the store starts in default state
- **WHEN** `setAccent('violet')` is called
- **THEN** `document.documentElement.style.getPropertyValue('--accent')`
  resolves to `#a78bfa`
- **AND** `getPropertyValue('--accent-dim')` resolves to
  `rgba(167,139,250,0.15)`

#### Scenario: Setting density flips the data attribute

- **GIVEN** the store starts in default state
- **WHEN** `setDensity('compact')` is called
- **THEN** `document.documentElement.getAttribute('data-density') === 'compact'`

#### Scenario: Density rules do not affect the live deck panel

- **GIVEN** `data-density="compact"` is set on the document root
- **WHEN** the LiveDeckPanel renders an active match
- **THEN** card row vertical padding is unchanged from the comfortable
  layout

### Requirement: Settings page exposes an Appearance category

`apps/desktop/src/renderer/src/components/Settings.tsx` SHALL expose
an "Appearance" category in its left sidebar, slotted directly below
"General". The category panel MUST contain:

- A Language row (the existing language picker, moved from "General"
  into this category — same component, same persistence).
- A Density row with two segmented options (`comfortable`, `compact`).
- An Accent row with three swatches (`cyan`, `teal`, `violet`),
  rendered as small color-filled buttons. The active swatch MUST show
  a visible selected state (ring or check mark) using token utility
  classes only — no hard-coded hex.

All labels, descriptions, and accessible names in the Appearance panel
MUST resolve through the active i18n locale; new keys live under
`settings.appearance.*` in `resources/locales/en-US.json` and
`resources/locales/zh-CN.json`.

The "General" category panel MUST NOT contain the language row after
this change lands.

#### Scenario: Sidebar lists Appearance below General

- **WHEN** the Settings page renders with the default category
- **THEN** the sidebar enumerates exactly: General, Appearance, Tracker,
  Overlay, Notifications, Data, Audio
- **AND** clicking "Appearance" opens the appearance panel

#### Scenario: Language picker only appears under Appearance

- **WHEN** the user opens the General category
- **THEN** the language picker is not present
- **WHEN** the user opens the Appearance category
- **THEN** the language picker is present and reflects the current
  `useI18nStore` preference

#### Scenario: Selecting accent updates the highlighted swatch

- **GIVEN** the Appearance panel is open and `cyan` is active
- **WHEN** the user clicks the `violet` swatch
- **THEN** the `violet` swatch shows the selected ring within 100ms
- **AND** the store reports `accent === 'violet'`

#### Scenario: Appearance labels follow the active locale

- **GIVEN** the active app locale is `zh-CN`
- **WHEN** the Appearance panel renders
- **THEN** the section heading, density row label, and accent row
  label all render in Chinese
