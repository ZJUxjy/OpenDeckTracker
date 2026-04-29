# Implementation Tasks

## 1. Appearance Store

- [x] 1.1 Add failing tests in `apps/desktop/src/renderer/tests/appearance-store.test.ts` covering: (a) defaults when nothing is stored; (b) round-trip read after a write; (c) malformed JSON in `localStorage.hdt.appearance` falls back to defaults silently; (d) unknown enum values fall back to defaults; (e) `ACCENT_PALETTE` exposes exactly `cyan`, `teal`, `violet` with the design-document hex/rgba values. Run and expect failure.
- [x] 1.2 Create `apps/desktop/src/renderer/src/stores/appearance-store.ts` with the Zustand store, `LANGUAGE_PREFERENCE_STORAGE_KEY`-style storage helpers, and the frozen `ACCENT_PALETTE` map. Run tests; expect pass.
- [x] 1.3 Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0.
- [ ] 1.4 Commit with message `feat(desktop): add appearance preferences store`.

## 2. Apply-Effect Wiring

- [x] 2.1 Add failing tests in `apps/desktop/src/renderer/tests/appearance-apply.test.tsx` covering: (a) mounting the apply-effect sets `data-density` and `--accent` / `--accent-dim` from the current store state; (b) calling `setAccent('violet')` updates the inline custom properties; (c) calling `setDensity('compact')` updates the data attribute; (d) unmounting cleans up nothing it should not (the inline properties persist for the rest of the page lifetime). Run and expect failure.
- [x] 2.2 Create `apps/desktop/src/renderer/src/components/AppearanceApplyEffect.tsx` (a renderless component subscribed to the store; not a hook so it can sit in the React tree at app root). Run tests; expect pass.
- [x] 2.3 Mount `<AppearanceApplyEffect />` in `apps/desktop/src/renderer/src/main.tsx` at the top of the React tree, before `<I18nProvider>`. Verify by running existing renderer tests (no regressions).
- [ ] 2.4 Commit with message `feat(desktop): apply appearance preferences to document root`.

## 3. Density CSS Rules

- [x] 3.1 Edit `apps/desktop/src/renderer/src/styles/theme.css`: add a `[data-density="compact"]` block that reduces padding on a small allow-list of chrome selectors (settings rows `.bg-bg-2.rounded-xl[role="group"]` or equivalent class selector, KPI cards, recent-match rows). Document the allow-list in a single CSS comment.
- [x] 3.2 Add a regression test `apps/desktop/src/renderer/tests/density.test.tsx` that renders a fixture of one Settings row, one KPI card, and one LiveDeckPanel row under `data-density="compact"` and asserts the chrome selectors get the reduced padding while the LiveDeckPanel row does not change. Run and expect pass.
- [ ] 3.3 Commit with message `feat(desktop): add compact density CSS rules`.

## 4. i18n Strings

- [x] 4.1 Add new keys under `settings.appearance.*` in `resources/locales/en-US.json`: `categoryLabel` ("Appearance"), `density.title` ("Density"), `density.description`, `density.comfortable`, `density.compact`, `accent.title` ("Accent"), `accent.description`, `accent.cyan`, `accent.teal`, `accent.violet`. JSON parse check.
- [x] 4.2 Mirror with translated values into `resources/locales/zh-CN.json`. JSON parse check.
- [ ] 4.3 Commit with message `feat(i18n): add settings appearance strings`.

## 5. Settings Page Integration

- [x] 5.1 Add failing tests in `apps/desktop/src/renderer/tests/Settings.appearance.test.tsx` covering: (a) sidebar lists "Appearance" between "General" and "Tracker"; (b) opening "Appearance" reveals the language picker, density segmented control, and accent swatches; (c) opening "General" no longer shows the language picker; (d) clicking the `violet` swatch updates `useAppearanceStore.getState().accent` to `'violet'`; (e) labels render in Chinese under `<I18nProvider preference="zh-CN">`. Run and expect failure.
- [x] 5.2 Update `apps/desktop/src/renderer/src/components/Settings.tsx`:
  - Insert `appearance` between `general` and `tracker` in the categories array.
  - Move the existing language row markup out of the General section into a new Appearance section.
  - Render the density segmented control and accent swatches inside Appearance, wired to `useAppearanceStore`.
  - Use only token utility classes; no hard-coded hex (the swatches' fill colors come from `ACCENT_PALETTE` via inline `style={{ backgroundColor }}` because that's the swatch chip's job — this is the documented exception the regression grep test allow-lists, mirroring the rarity-tint exception).
- [x] 5.3 Update `apps/desktop/src/renderer/tests/theme-tokens-grep.test.ts` to add `Settings.tsx` accent swatch chip to the allow-list narrowed to that file's specific lines (or to the swatch-chip-only inline-style pattern). Run grep test; expect pass.
- [x] 5.4 Run all renderer tests (`pnpm --filter @hdt/desktop exec vitest run`); expect green.
- [x] 5.5 Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0.
- [ ] 5.6 Commit with message `feat(desktop): add Appearance category to Settings`.

## 6. Final Validation and Archive

- [x] 6.1 Run `pnpm --filter @hdt/desktop exec vitest run`; expect all renderer tests green (sqlite-bound test files may continue to fail with the pre-existing native-ABI mismatch — note in commit if so).
- [x] 6.2 Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0.
- [ ] 6.3 Run `npx openspec validate add-settings-appearance --strict`; expect "Change … is valid".
- [ ] 6.4 Manual smoke: launch `pnpm dev`, open Settings → Appearance; toggle each accent (cyan, teal, violet) and confirm the active-tab rail, KPI accents, and Decklist mana chips update without reload; toggle density to compact and back; toggle language between en-US / zh-CN and confirm the Appearance labels switch; reload the app and confirm preferences persist.
- [x] 6.5 Run `git status` to confirm only in-scope files changed.
- [ ] 6.6 Archive change via `/opsx:archive add-settings-appearance`.
