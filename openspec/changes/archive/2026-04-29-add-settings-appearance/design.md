## Context

The Console UI direction (`add-console-theme-tokens`, archived
2026-04-29) gave the renderer a single design language driven by CSS
custom properties on `:root`. The Settings page already hosts a
language picker that persists through `useI18nStore`
(`localStorage` key `hdt.languagePreference`). All other "presentation"
controls in the app are either nonexistent or hard-coded.

This change introduces a second presentation preference (density) and
a runtime accent override, and groups them with the language picker
under a new "Appearance" sidebar category. There is no main-process
settings file yet — the existing renderer-only persistence pattern
(localStorage + Zustand) is reused.

## Goals / Non-Goals

**Goals:**
- A single sidebar category in Settings ("Appearance") that owns every
  presentation preference.
- Live-applied density and accent without an app reload.
- Persistence across sessions matching the existing language model.
- Zero changes to packages outside `apps/desktop`.

**Non-Goals:**
- Building a main-process settings store. Persistence stays in
  `localStorage`. Migration to a file-backed store is explicitly the
  job of a future `add-settings-persistence` change.
- New theme presets beyond three accent colors. Light theme, custom
  user themes, and font-family overrides are out.
- OS-level wiring for the existing General toggles (auto-start,
  minimize-to-tray, hardware-acceleration). They stay UI-only.

## Decisions

### D1 — Where appearance preferences live

**Context.** The renderer already has `useI18nStore` for language;
adding density/accent there would conflate "what locale am I in" with
"what color is my accent."

**Options.**
1. Extend `useI18nStore` with extra fields.
2. Create a separate `useAppearanceStore` that mirrors the i18n store
   shape (Zustand + localStorage round-trip).
3. Build a unified `useUserPreferencesStore` that subsumes both.

**Choice.** Option 2.

**Rationale.** Option 1 conflates concerns and would force the i18n
store to grow code paths it does not need. Option 3 is correct
long-term but is the job of `add-settings-persistence` once the
main-process store lands — premature here. Option 2 is the smallest
step that mirrors the existing pattern users (and tests) already
recognize.

### D2 — How accent override is applied

**Context.** `theme.css` declares `--accent: #22d3ee;` on `:root`.
Tailwind v4 `@theme inline` maps that variable to the `text-accent`,
`bg-accent`, etc. utility classes. We need a runtime override that
flows into every existing usage.

**Options.**
1. Inline `<style>` injection at runtime that re-declares `:root`.
2. Set inline style on `document.documentElement`
   (`element.style.setProperty('--accent', ...)`).
3. Add a `data-accent="..."` attribute and write a CSS rule for each
   accent in `theme.css`.

**Choice.** Option 2.

**Rationale.** Option 1 risks specificity ordering vs the
authored `:root`. Option 3 ties the available accents to CSS source —
adding/removing an accent requires editing CSS, a poor split. Option 2
inherits from `:root`, takes priority over the authored value via
specificity (inline > selector), and lets the store own the swatch
list as plain TS data. Both `--accent` and `--accent-dim` get set
together (the dim variant is a 15%-alpha derivative — we precompute
it from the chosen hex via `colorMix` or hand-coded RGBA strings).

### D3 — How density is applied

**Context.** Density needs to affect many components without rewriting
every padding utility class. The Console direction already centralizes
spacing scale through Tailwind utilities, not custom tokens.

**Options.**
1. Toggle a `data-density="compact"` attribute on
   `document.documentElement` and write a small set of CSS overrides
   in `theme.css` (`[data-density="compact"] .p-5 { padding: 0.75rem }`
   etc.).
2. Introduce two parallel Tailwind variants and have every component
   conditionally pick.
3. Replace common spacing classes with custom tokens that switch off
   the data attribute.

**Choice.** Option 1, narrow scope.

**Rationale.** Option 2 spreads the concern across every component.
Option 3 expands the token system before we know the long-term shape.
Option 1 keeps the component code untouched and bounds blast radius:
the compact override CSS lives in one place and only re-tunes the
chrome surfaces (settings rows, KPI cards, list items) — not card
artwork, charts, or text scale. We explicitly target a small allow-list
of selectors so density never affects gameplay-critical surfaces like
the live deck panel.

### D4 — Storage key and shape

**Context.** The renderer already uses one localStorage key
(`hdt.languagePreference`). We want the appearance preferences
loadable by a future settings migration with no ambiguity.

**Choice.** A single namespaced key `hdt.appearance` storing JSON
`{ density: 'comfortable' | 'compact', accent: 'cyan' | 'teal' | 'violet' }`.
Bad/missing data falls back to the defaults (`comfortable`, `cyan`)
silently — same forgiving model as `useI18nStore`.

### D5 — Apply timing

The store mounts an effect at the top of `main.tsx` (next to where the
React tree mounts). The effect:
1. Reads from store.
2. Applies `data-density` and inline `--accent` / `--accent-dim` once
   on mount.
3. Subscribes to store changes and re-applies.

This avoids each consumer component having to call `applyAppearance`.

### D6 — Accent palette

The three accent values are authored as a frozen TS map keyed by the
swatch id, so the store and the Settings UI stay in sync via a single
source of truth. Values:

| id      | `--accent`  | `--accent-dim`                      |
|---------|-------------|-------------------------------------|
| `cyan`  | `#22d3ee`   | `rgba(34,211,238,0.15)`             |
| `teal`  | `#2dd4bf`   | `rgba(45,212,191,0.15)`             |
| `violet`| `#a78bfa`   | `rgba(167,139,250,0.15)`            |

Cyan exactly matches the authored `:root` token, so the default state
of the override is identity (no visual change vs no override).

## Risks / Trade-offs

- **Risk:** A user picks `violet` and complains some chart line, badge
  border, or box-shadow that hard-codes cyan does not follow.
  → **Mitigation:** the regression grep test from the Console tokens
  change forbids hex literals in the in-scope source set, so almost
  every accent surface already routes through `--accent`. We will
  manually audit `MatchupMatrix` cells and the rarity tints (allowed
  exceptions), and fix any stragglers in the same change.

- **Risk:** Density CSS is too aggressive and breaks alignment in
  rows that depend on specific paddings.
  → **Mitigation:** start with a tightly scoped allow-list of
  selectors (settings rows, KPI cards, list items) and ship under a
  feature flag-ish posture: the user can flip back to `comfortable`
  with one click if anything looks off.

- **Risk:** `localStorage` write fails in some Electron edge case
  (private mode, disk full).
  → **Mitigation:** wrap writes in try/catch the same way
  `i18n-store.ts` does; the in-memory store still drives the session.

- **Trade-off:** No main-process persistence means appearance preferences
  do not survive `localStorage.clear()` or a per-window data partition
  reset. Acceptable for now — the same is already true of the language
  preference, and migrating both at once is what
  `add-settings-persistence` is for.
