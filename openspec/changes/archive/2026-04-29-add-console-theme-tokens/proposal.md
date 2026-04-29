## Why

Per the Claude Design handoff (`OpenDeckTracker UI.html`, chat 1, 2026-04-29), Direction A "Console" is locked as the visual system. Today every renderer surface ships its own hard-coded palette — `#0E0E14` backgrounds, `#1C1C24` cards, `#2A2A35` borders, and an orange accent (`#F97316`) baked into ~20 components via Tailwind arbitrary-value utilities (`bg-[#1C1C24]`). The shadcn-style `theme.css` CSS variables that *do* exist are dead code — they declare a light-mode `--background: #ffffff` palette no component consumes.

This drift makes future theme presets impossible (the design ultimately wants 6 presets: Console, Slate, Hearth, Frost, Minimal, Arcade), and even the immediate Console retheme requires touching every component to swap accents. The fix is to land the tokens **once**, route every component through them, and then later changes (per-preset themes, per-class accents, OBS streaming mode) become low-cost variable swaps.

## What Changes

- **NEW** Console token table baked into `theme.css` `:root`: `--bg`, `--bg2`, `--bg3`, `--border`, `--border-hi`, `--text`, `--text-dim`, `--text-mute`, `--accent`, `--accent-dim`, `--green`, `--red`, `--amber`, plus `--font-sans` (Inter) and `--font-mono` (JetBrains Mono). Exact values from `direction-a-console.jsx`'s `A_TOKENS`.
- **NEW** Tailwind v4 `@theme` mapping in `tailwind.css` (or a sibling) exposing the tokens as utility classes: `bg-bg`, `bg-bg2`, `text-text`, `border-border`, `text-accent`, `font-mono`, etc. Components consume utilities, not raw vars.
- **NEW** `fonts.css` loads Inter (400/500/600/700/800) and JetBrains Mono (400/500/600/700) via Google Fonts (preconnect + `display=swap`). The HTML `<head>` keeps the existing `preconnect` block but moves font URLs into the bundled CSS so the renderer works offline once cached.
- **MODIFIED** ~20 component files swap hard-coded color literals for token utilities. Concrete sweep:
  - `App.tsx`, `Sidebar.tsx`, `Dashboard.tsx`, `LiveDeckPanel.tsx`, `OpponentCardsPanel.tsx`, `DeckSelectDialog.tsx`, `Stats.tsx`, `Collection.tsx`, `Settings.tsx`, `OverlayView.tsx`
  - From `add-deck-management`: `Decklist.tsx`, `DecksPage.tsx`, `DeckEditor.tsx`, `DeckImportDialog.tsx`, `DeckExportDialog.tsx`, `SaveLiveDeckButton.tsx`, `CardImagePopover.tsx`
  - From `add-stats-analytics-deepening`: `FormatFilterPills.tsx`, `MatchupMatrix.tsx`, `WinrateTimeSeriesChart.tsx`, `PlayOrderSplitCard.tsx`, `MatchRecordingViewer.tsx`
  - The orange accent `bg-orange-500` / `text-orange-400` / `bg-orange-600` becomes `bg-accent` / `text-accent` / `bg-accent` (cyan).
- **NEW** All numeric / monospace UI (mana counts, card-counts, percentages, timestamps, version strings, KPI values) wrapped in `font-mono` so JetBrains Mono renders consistently. Today these mix Inter + Tailwind-default monospace.
- **NEW** Cyan-accent palette for status pills and primary buttons. Existing semantic colors (green for win, red for loss/error, amber for warning) keep their roles but adopt the Console exact hex values (`#34d399` / `#f87171` / `#fbbf24`).
- **MODIFIED** `Sidebar.tsx` icon-active treatment: from "shadow-[inset_4px_0_0_0_#F97316]" to a token-driven left rail (`shadow-[inset_4px_0_0_0_var(--accent)]` or equivalent utility).
- **MODIFIED** Existing Stats / Decks / SaveLive components keep their structure; only colors + font swap. No layout changes in this change.
- **NO new components**, **no surface anatomy changes**: KPI strip on Tracker, Deck Finder rewrite, Sets Collection, Opponent Overlay, Settings → Appearance preset picker — all deferred to follow-up changes that consume this token foundation.

## Capabilities

### New Capabilities

- `console-theme-tokens`: defines the Console preset values, the requirement that all renderer surfaces consume tokens (not raw color literals), the font loading contract, and the rule that every numeric UI element uses `font-mono`.

### Modified Capabilities

- `deck-tracker-core`: the existing `Renderer Zustand store + React panel` requirement gains clauses that visual styling routes through Console tokens and that numeric values use `font-mono`. (LiveDeckPanel + DeckSelectDialog explicitly mention rendering, so the tokens contract belongs there.)

Other UI capabilities (`deck-management-ui`, `match-history-stats`, `match-recordings`, `i18n-support`) are covered by the new `console-theme-tokens` capability's "Renderer surfaces consume tokens" requirement, which enumerates every relevant component file. No per-capability MODIFIED delta is needed; that would be duplication.

## Impact

- **Code (new)**:
  - `apps/desktop/src/renderer/src/styles/fonts.css` — Inter + JetBrains Mono loader.
  - Update `apps/desktop/src/renderer/src/styles/theme.css` with the Console `:root` block.
  - Update `apps/desktop/src/renderer/src/styles/tailwind.css` with `@theme` mapping.
- **Code (modified)**: ~20 component files (listed above), one-by-one color/font sweep.
- **No DB / IPC / Electron-main changes.** This is renderer-only.
- **No new dependencies.** Inter + JetBrains Mono are already linked from the design's `<head>` example; we just localize the import.
- **Tests**: existing component tests must keep passing under the new colors. Add 1 small smoke test asserting `theme.css` exports the expected `--accent` value (so a regression is loud). React Testing Library tests don't render computed colors, so visual changes won't break them; we'll catch regressions via TypeScript on utility class names + a manual smoke pass.
- **i18n**: untouched.

## Non-goals

- **Multiple presets** — only Console lands now. Slate / Hearth / Frost / Minimal / Arcade come with `add-settings-appearance`. Token shape is forward-compatible.
- **Component-level "recipes"** (`countStyle: pip|numeric`, `rowAnatomy: compact|comfortable|card`, `chrome: sharp|round|ornamental|pixel`) — deferred. No real consumer exists until a second preset lands.
- **Layout / surface changes** — no KPI strip, no Sets Collection rewrite, no Opponent Overlay window, no Deck Finder. Follow-up changes only.
- **Light-mode preview** — the design's `Frost` preset is light, but it ships with the Settings → Appearance change. This change locks Console (dark-only).
- **Per-class accent tinting** for the opponent overlay — opponent overlay window itself doesn't exist yet.
- **OBS / streaming mode** — UX hook deferred to Settings → Appearance.
- **Custom user-defined themes / fork-active export** — same.
- **Sweeping `Tailwind config.ts`-based color extension** — Tailwind v4's `@theme` directive in CSS is the idiomatic path; we don't introduce a new `tailwind.config.ts` file.
- **Renaming existing variables** in `theme.css` that downstream shadcn-style components might consume — those vars (`--background`, `--foreground`, `--card`, …) are dead code today; we leave them as-is to avoid scope creep, and add the new `--bg`/`--accent`/etc. alongside them.
