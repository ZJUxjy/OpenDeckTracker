## Why

The Settings page exposes a Language picker but no other presentation
controls, so users who want a denser layout or a different accent within
the Console direction have nowhere to set it. The change creates a real
"Appearance" category that hosts every presentation-layer preference
(language, density, accent) behind a small persisted settings model,
and live-applies each preference to the renderer through CSS custom
properties without a reload.

## What Changes

- Add an "Appearance" category to `Settings.tsx`, slotted directly
  below "General". It is the new home for all presentation preferences.
- **MOVED**: the Language picker moves out of General → Appearance.
  Behavior is unchanged; the row is the same Radix-styled segmented
  control, persistence keeps using `useI18nStore`.
- **NEW**: a Density preference (`comfortable` | `compact`). Compact
  reduces vertical padding on rows, list items, and KPI cards. The
  preference toggles a `data-density="<value>"` attribute on
  `document.documentElement` that CSS rules in `theme.css` consume.
- **NEW**: an Accent preference. Three swatches within the Console
  direction's cool palette: `cyan` (default, `#22d3ee`), `teal`
  (`#2dd4bf`), `violet` (`#a78bfa`). Selecting a swatch overwrites
  `--accent` and `--accent-dim` on `document.documentElement` for the
  rest of the session and persists in localStorage.
- **NEW**: a small `useAppearanceStore` Zustand store mirroring the
  shape of `useI18nStore` — it exposes `density`, `accent`,
  `setDensity`, `setAccent`. Reads/writes go through localStorage with
  a single namespaced key (`hdt.appearance`). The store mounts an
  effect at app start that applies both preferences to
  `document.documentElement`.
- **NEW**: `i18n` keys under `settings.appearance.*` for all new labels
  (en-US + zh-CN).

Non-goals:
- No new theme presets beyond the three accents — the Console palette
  stays the only color story.
- No main-process settings file — persistence stays in
  `localStorage`. A separate `add-settings-persistence` change later
  will migrate all renderer preferences to a real settings store.
- No wiring of `auto-start`, `minimize-to-tray`, or
  `hardware-acceleration` toggles to OS APIs — those remain UI-only
  placeholders covered by `add-app-behavior` later.
- No font-family preference. Inter + JetBrains Mono are locked by the
  Console direction.
- No light theme.

## Capabilities

### New Capabilities
- `appearance-preferences`: density and accent preferences for the
  renderer, persisted across sessions and live-applied as CSS custom
  properties / data attributes on `document.documentElement`.

### Modified Capabilities
<!-- The Console tokens spec already declares the cyan accent as the
     default and `console-theme-tokens` does not need to relax that —
     the new accent swatches override `--accent` at runtime, the
     authored token remains cyan. No spec changes required. -->

## Impact

- `apps/desktop/src/renderer/src/components/Settings.tsx` — new
  Appearance section, Language picker moved into it.
- `apps/desktop/src/renderer/src/stores/` — new
  `appearance-store.ts`.
- `apps/desktop/src/renderer/src/styles/theme.css` — add density
  rules keyed off `[data-density="compact"]`.
- `apps/desktop/src/renderer/src/main.tsx` — mount the appearance
  store's apply-effect once at boot.
- `resources/locales/en-US.json`, `resources/locales/zh-CN.json` —
  new `settings.appearance.*` keys.
- No changes to main process, IPC, or any package outside `apps/desktop`.
