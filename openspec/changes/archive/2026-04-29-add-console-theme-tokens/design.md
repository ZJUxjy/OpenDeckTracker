## Context

The Claude Design handoff (`docs/design/opendecktracker/` after this change archives the bundle, currently `.scratch/claude-design/`) locks Direction A "Console" with an exact token table inside `direction-a-console.jsx`. Today's renderer surfaces sprawl across two visual systems:

- The `theme.css` `:root` block ships a shadcn-default light-theme palette (`--background: #ffffff`, `--primary: #030213`, etc.). No component reads these.
- Components ship a different, hard-coded dark palette inline via Tailwind arbitrary values: `bg-[#0E0E14]`, `bg-[#1C1C24]`, `border-[#2A2A35]`, `text-orange-500`. The actual rendered look.

The contradiction has bitten us before — the figma export ran on the first palette while the live renderer runs on the second. Both palettes drift from each other every time a new component is added. The Console handoff is the third palette, and we explicitly do not want a fourth.

This change consolidates: kill the dead light-theme block (or relegate it), bake Console as the active set, and force every component to read from utility classes that resolve to those tokens. Subsequent preset changes (`add-settings-appearance`) become two-line additions of new `:root[data-theme="X"]` blocks; they do not touch any component.

The renderer is Tailwind v4 + Vite. Tailwind v4's idiomatic theming is the `@theme` CSS directive — no `tailwind.config.ts` needed. We already have `tailwind.css` as the single import point.

Stakeholders:
- Future preset rollout (Slate, Hearth, Frost, Minimal, Arcade) — contract for what tokens exist.
- Component test suite — class names changing without behavior changes; no test fixtures touched.
- Manual operators — visual diff is the obvious change.

## Goals / Non-Goals

**Goals:**

- Bake Console palette into `theme.css` `:root`.
- Expose tokens as Tailwind v4 utility classes (`bg-bg2`, `text-accent`, `font-mono`, etc.) via the `@theme` directive in `tailwind.css`.
- Sweep the ~20 components that hard-code colors; replace literals with utility classes.
- Load Inter + JetBrains Mono via bundled `fonts.css`.
- Force every numeric / monospace UI element to use `font-mono`.
- Land without changing any layout, KPI strip, or new surface.
- Forward-compat for follow-up presets: a future change only adds new `:root[data-theme="slate"] { ... }` overrides.

**Non-Goals:**

- Light-mode preview / `Frost` preset.
- Recipe layer (countStyle, rowAnatomy, chrome).
- KPI strip on Tracker, Sets Collection, Opponent Overlay window, Deck Finder, Settings → Appearance.
- Per-class accent tinting.
- OBS / streaming mode.
- Renaming the existing dead shadcn-style vars (`--primary`, `--card`, …); they stay co-resident.

## Decisions

### D1. Tailwind v4 `@theme` vs JS config

**Choice:** **`@theme` directive in `tailwind.css`.** Tailwind v4's first-class theming path. No JS config file added; the project doesn't currently have one and we shouldn't reintroduce that surface.

**Rationale:** keeps theme + utility wiring in one place, and the pure-CSS shape lines up with how the design handoff expressed tokens (`A_TOKENS` is a flat object — no JS-only logic).

### D2. Token names

**Options considered:**

- A. Mirror `A_TOKENS` from the design exactly: `bg`, `bg2`, `bg3`, `border`, `borderHi`, `text`, `textDim`, `textMute`, `accent`, `accentDim`, `green`, `red`, `amber`, `mono`, `sans`.
- B. Rename to a more semantic shadcn-style: `--background`, `--surface-1`, `--surface-2`, `--text-primary`, …
- C. Hybrid: keep the design names, alias to shadcn for compat.

**Choice:** **A**. Match the design names verbatim.

**Rationale:** the design is the spec. Renaming would require a second mental map between code and design source. The shadcn naming applies to a different problem (radix primitives' built-in semantics) we don't use. The dead shadcn vars stay in `:root` co-resident; we don't reuse those names for new tokens.

CSS variable names: `--bg`, `--bg-2`, `--bg-3`, `--border`, `--border-hi`, `--text`, `--text-dim`, `--text-mute`, `--accent`, `--accent-dim`, `--green`, `--red`, `--amber`, `--font-sans`, `--font-mono`. (Hyphenated per CSS convention.)

Tailwind utility names follow the @theme convention: `bg-bg`, `bg-bg-2`, `bg-bg-3`, `text-text`, `text-text-dim`, `text-text-mute`, `border-border`, `border-border-hi`, `text-accent`, `bg-accent`, `bg-accent-dim`, `text-green`, `text-red`, `text-amber`, `font-sans`, `font-mono`.

### D3. Exact Console values

```
--bg:         #0b0f14
--bg-2:       #11161d
--bg-3:       #161c25
--border:     #1f2731
--border-hi:  #2a3543
--text:       #e6edf3
--text-dim:   #8b96a3
--text-mute:  #5b6573
--accent:     #22d3ee   /* cyan */
--accent-dim: rgba(34,211,238,0.15)
--green:      #34d399
--red:        #f87171
--amber:      #fbbf24
--font-sans:  'Inter', system-ui, -apple-system, sans-serif
--font-mono:  'JetBrains Mono', ui-monospace, SFMono-Regular, monospace
```

These come straight from `direction-a-console.jsx` with no edits.

### D4. Light vs dark mode plumbing

**Choice:** Console is dark-only. Set the body background and text color from `--bg` / `--text`. No `[data-theme="light"]` sibling block. The existing dead shadcn light-theme `:root` vars stay declared but unused; deleting them is out of scope.

**Rationale:** the design is dark-locked. Adding a fake light-mode block would invite component authors to use both, which is exactly the drift we're trying to fix.

### D5. Font loading

**Choice:** `fonts.css` declares `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');`. The renderer's `<head>` keeps the `preconnect` hints. Fonts cache after first load — Electron renderer keeps the Chromium cache across restarts.

**Risk:** offline first-launch shows fallback fonts until cache populates. Mitigation: defer to `add-settings-appearance` for self-hosted bundling if it becomes a real complaint.

### D6. Sweep strategy for the ~20 hard-coded files

**Choice:** mechanical find-replace per file, with `npm run typecheck` green and `pnpm test` green after each batch. Concrete substitution table:

| Hard-coded | Token utility |
|---|---|
| `bg-[#0E0E14]` / `bg-[#0a0a12]` | `bg-bg` |
| `bg-[#14141A]` | `bg-bg` (or `bg-bg-2` for cards) |
| `bg-[#1C1C24]` / `bg-[#1a1a24]` | `bg-bg-2` |
| `bg-[#12121A]` | `bg-bg-2` (close enough — Console picks one bg-2) |
| `bg-[#161c25]` | `bg-bg-3` |
| `border-[#2A2A35]` | `border-border` |
| `border-[#3A3A45]` | `border-border-hi` |
| `text-orange-500` / `text-orange-400` / `text-orange-300` | `text-accent` |
| `bg-orange-500` / `bg-orange-600` | `bg-accent` |
| `bg-orange-500/15` etc. | `bg-accent-dim` |
| `border-orange-500` | `border-accent` |
| `text-emerald-300` / `text-emerald-400` | `text-green` |
| `text-red-400` / `text-red-500` | `text-red` |
| `text-amber-300` / `text-amber-400` | `text-amber` |
| `text-slate-300` | `text-text` |
| `text-slate-400` | `text-text-dim` |
| `text-slate-500` | `text-text-mute` |
| `font-mono` (already exists) | unchanged |
| `font-bold` for percent / count numerics | wrap in span with `font-mono` |

The slate→token mapping is approximate but consistent — we are converging palettes, not preserving subtle differences. After this change, slate-* utilities don't appear in production code.

### D7. Numeric `font-mono` enforcement

**Choice:** mechanical pass to add `font-mono` to: card counts (×N badges), KPI numbers, percentages, durations (`MM:SS`), timestamps, version strings, and the bottom-bar `Hand X · Opponent Y` string. Use Tailwind `tabular-nums` alongside `font-mono` so numbers don't jiggle on update.

### D8. Sidebar accent change visibility

The sidebar's active-tab indicator currently uses `shadow-[inset_4px_0_0_0_#F97316]` (orange). The token-driven equivalent: `shadow-[inset_4px_0_0_0_var(--accent)]` (cyan). Tailwind v4 supports `var(--*)` inside arbitrary value brackets natively.

### D9. Test strategy

- Existing 367+ tests should pass unchanged. Snapshot-style tests don't exist; assertions target text content / `data-testid` / interaction — colors are not asserted.
- Add ONE smoke test in `apps/desktop/src/renderer/tests/theme.test.ts`: import the CSS file as text via Vite's `?raw` import, assert `--accent: #22d3ee;` appears. This catches "someone reverted the token block" regressions without needing a headed browser.
- Manual smoke: `pnpm dev`, page through Tracker / Decks / Stats / Collection / Settings / Overlay, confirm cyan accent, slate bg, JetBrains Mono numerics. Check both languages.

### D10. Fonts.css contents

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
```

That's the entire file. Preconnect hints stay in `index.html`.

## Risks / Trade-offs

- **[Risk] CSS-arbitrary-value diffs miss something.** A component using `text-[#F97316]` directly (rather than the named utility) wouldn't match my regex. → mitigation: a final repo-wide grep for `[#0e0e14|#1c1c24|#14141a|#2a2a35|#f97316|orange-]` after the sweep; CI lint via `pnpm lint` catches stray classes.
- **[Risk] `font-mono` regression on number-heavy UI** if a number isn't wrapped. → mitigation: walk every component during the sweep; the design source's numerics live in clear places (KPI cells, percent badges, count badges, timestamps).
- **[Trade-off] Slate-utility convergence.** `text-slate-300` and `text-slate-400` both become `text-text-dim` in Console. We lose a one-step gradient. The design uses two text dim levels (`text-dim` and `text-mute`), which we mirror, but the fine-grained slate scale collapses into our two stops. Acceptable; the design's two-stop ladder is intentional.
- **[Trade-off] Cyan accent vs the existing orange brand identity.** This is the visual lock the user explicitly requested.
- **[Trade-off] Google-fonts CDN dependency on first launch.** Acceptable until offline-first becomes a goal; document under non-goals.

## Migration Plan

Per-batch commits, gate by `pnpm typecheck` + `pnpm test`. No data migration. No DB / IPC / electron-main changes. Rollback: revert the change. CSS-only side has zero state.

## Open Questions

- **Should we remove the dead shadcn light-theme `:root` block entirely?** Defer to a separate cleanup change. Co-existence is harmless since no consumer reads them.
- **Should `tabular-nums` be applied globally to mono numerics or per-instance?** Per-instance for now (avoids over-application to non-numeric mono text like version strings, where proportional spacing reads better).
- **Bundled vs CDN fonts.** CDN now; revisit when offline reliability is a goal.

## Final touched-files tree

```
apps/desktop/src/renderer/src/styles/
├── theme.css                         # MOD: Console :root block
├── tailwind.css                      # MOD: @theme mapping
└── fonts.css                         # MOD: load Inter + JetBrains Mono

apps/desktop/src/renderer/src/
├── App.tsx                           # MOD: bg/text utilities
├── components/
│   ├── Sidebar.tsx                   # MOD: cyan inset, hover utilities
│   ├── Dashboard.tsx                 # MOD
│   ├── LiveDeckPanel.tsx             # MOD
│   ├── OpponentCardsPanel.tsx        # MOD
│   ├── DeckSelectDialog.tsx          # MOD
│   ├── Stats.tsx                     # MOD
│   ├── Collection.tsx                # MOD
│   ├── Settings.tsx                  # MOD
│   ├── OverlayView.tsx               # MOD
│   ├── Decklist.tsx                  # MOD (SavedDecksList)
│   ├── DecksPage.tsx                 # MOD
│   ├── DeckEditor.tsx                # MOD
│   ├── DeckImportDialog.tsx          # MOD
│   ├── DeckExportDialog.tsx          # MOD
│   ├── SaveLiveDeckButton.tsx        # MOD
│   ├── CardImagePopover.tsx          # MOD
│   ├── FormatFilterPills.tsx         # MOD
│   ├── MatchupMatrix.tsx             # MOD
│   ├── WinrateTimeSeriesChart.tsx    # MOD
│   ├── PlayOrderSplitCard.tsx        # MOD
│   └── MatchRecordingViewer.tsx      # MOD
└── tests/
    └── theme.test.ts                 # NEW: token export smoke test
```
