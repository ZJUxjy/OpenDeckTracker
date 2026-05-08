## Purpose

Defines the Console preset's design tokens — surface colors, text/accent colors, fonts, and (since custom-scrollbar) scrollbar tokens — as CSS custom properties in the renderer, plus the Tailwind utility-class mapping that exposes them to components.
## Requirements
### Requirement: Console token table is the renderer's single source of color truth

The renderer SHALL declare the Console preset's color, font, and surface tokens as CSS custom properties in `apps/desktop/src/renderer/src/styles/theme.css` `:root`. The exact token values MUST be:

```
--bg:                    #0b0f14
--bg-2:                  #11161d
--bg-3:                  #161c25
--border:                #1f2731
--border-hi:             #2a3543
--text:                  #e6edf3
--text-dim:              #8b96a3
--text-mute:             #5b6573
--accent:                #22d3ee
--accent-dim:            rgba(34,211,238,0.15)
--green:                 #34d399
--red:                   #f87171
--amber:                 #fbbf24
--scrollbar-size:        8px
--scrollbar-track:       var(--bg-2)
--scrollbar-thumb:       var(--border-hi)
--scrollbar-thumb-hover: var(--text-mute)
--scrollbar-thumb-active:var(--accent)
--font-sans:             'Inter', system-ui, -apple-system, sans-serif
--font-mono:             'JetBrains Mono', ui-monospace, SFMono-Regular, monospace
```

Existing shadcn-style light-theme variables (`--background`, `--foreground`, `--primary`, etc.) MAY remain co-resident but MUST NOT be added to or relied on by new code.

The five `--scrollbar-*` tokens are part of the Console token contract and SHALL be referenced from `styles/scrollbar.css` rather than from component-level styles.

#### Scenario: Token block exports the Console accent

- **WHEN** a smoke test reads `theme.css` as raw text
- **THEN** the file contains the substring `--accent: #22d3ee;`

#### Scenario: All required Console tokens are declared

- **WHEN** the smoke test inspects the `:root` block
- **THEN** it finds declarations for every token in the table above, including the five `--scrollbar-*` tokens.

#### Scenario: Scrollbar thumb token reuses border-hi

- **WHEN** the smoke test resolves `--scrollbar-thumb`
- **THEN** it resolves to the same value as `--border-hi` (i.e. `#2a3543`), keeping the scrollbar thumb in the same surface tier as elevated borders.

### Requirement: Tokens are exposed as Tailwind utility classes

The renderer SHALL expose the Console tokens as Tailwind v4 utility classes via the `@theme` directive in `apps/desktop/src/renderer/src/styles/tailwind.css`. The mapping MUST include at minimum:

| Token | Utility class |
|---|---|
| `--bg` | `bg-bg`, `border-bg` |
| `--bg-2` | `bg-bg-2` |
| `--bg-3` | `bg-bg-3` |
| `--border` | `border-border` |
| `--border-hi` | `border-border-hi` |
| `--text` | `text-text` |
| `--text-dim` | `text-text-dim` |
| `--text-mute` | `text-text-mute` |
| `--accent` | `text-accent`, `bg-accent`, `border-accent` |
| `--accent-dim` | `bg-accent-dim` |
| `--green` | `text-green`, `bg-green` |
| `--red` | `text-red`, `bg-red` |
| `--amber` | `text-amber`, `bg-amber` |
| `--font-sans` | `font-sans` |
| `--font-mono` | `font-mono` |

#### Scenario: Components compile with token utilities

- **WHEN** a component uses `<div className="bg-bg-2 text-accent border-border">…</div>`
- **THEN** the Vite build resolves the utilities to CSS that references the corresponding `var(--bg-2)`, `var(--accent)`, `var(--border)`

### Requirement: Inter and JetBrains Mono are loaded via the renderer stylesheet

The renderer SHALL load Inter (weights 400, 500, 600, 700, 800) and JetBrains Mono (weights 400, 500, 600, 700) through `apps/desktop/src/renderer/src/styles/fonts.css`, imported from `index.css`. The HTML document MAY keep `<link rel="preconnect">` hints to the Google Fonts host but MUST NOT duplicate the `@import` URL outside the stylesheet.

#### Scenario: Renderer pages use Inter for body text

- **WHEN** the user opens any tab in the desktop app
- **THEN** body text renders in Inter (or a near-fallback while the font loads)

#### Scenario: Mono numerics use JetBrains Mono

- **WHEN** a component uses `<span className="font-mono">42</span>`
- **THEN** the span renders in JetBrains Mono (or a system monospace fallback while the font loads)

### Requirement: Renderer surfaces consume tokens, not raw color literals

Every renderer component SHALL express background, border, text, and accent colors via the token utility classes defined above. Inline arbitrary-value Tailwind classes referencing concrete hex codes (`bg-[#1C1C24]`, `text-[#F97316]`, etc.) MUST NOT appear in renderer source after this change lands.

The slate-* and orange-* legacy palette utilities (e.g. `text-slate-300`, `bg-orange-500`) MUST NOT appear in renderer source for the surfaces enumerated below; the substitution table in the change's design document defines the exact mapping.

In-scope surfaces:
- `App.tsx`, `Sidebar.tsx`, `Dashboard.tsx`, `LiveDeckPanel.tsx`, `OpponentCardsPanel.tsx`, `DeckSelectDialog.tsx`, `Stats.tsx`, `Collection.tsx`, `Settings.tsx`, `OverlayView.tsx`
- `Decklist.tsx`, `DecksPage.tsx`, `DeckEditor.tsx`, `DeckImportDialog.tsx`, `DeckExportDialog.tsx`, `SaveLiveDeckButton.tsx`, `CardImagePopover.tsx`
- `FormatFilterPills.tsx`, `MatchupMatrix.tsx`, `WinrateTimeSeriesChart.tsx`, `PlayOrderSplitCard.tsx`, `MatchRecordingViewer.tsx`

Out-of-scope (deferred to follow-up changes that may legitimately introduce new colors): components introduced by `add-opponent-overlay-window`, `add-deck-finder`, `add-settings-appearance`, `replace-collection-with-set-progress`, and `add-overlay-pip-counts`.

#### Scenario: Sidebar adopts the cyan accent

- **GIVEN** the sidebar with the Tracker tab active
- **WHEN** the page renders
- **THEN** the active tab's left rail uses `var(--accent)` (cyan), not a hard-coded orange literal

#### Scenario: Hard-coded color literals are absent from in-scope files

- **WHEN** a repository-wide grep runs against the in-scope source files for the patterns `#0E0E14`, `#1C1C24`, `#2A2A35`, `#F97316`, `bg-orange-`, `text-orange-`, `text-slate-`
- **THEN** zero matches are found in those files

### Requirement: Numeric and monospace UI elements use the mono font

Every numeric value rendered in the UI (card counts, percentages, durations, timestamps, version strings, KPI numbers, mana costs that are not gem-encoded) SHALL be wrapped in an element that resolves to the `font-mono` utility class.

Numeric values that update frequently SHOULD additionally use `tabular-nums` to prevent layout shift on increment.

#### Scenario: Card-count badges render in mono

- **WHEN** the LiveDeckPanel renders a row's `×N` count
- **THEN** the count text element has `font-mono` applied

#### Scenario: Timestamps in match history render in mono

- **WHEN** the recent-matches list renders a row's relative date
- **THEN** the timestamp element has `font-mono` applied

