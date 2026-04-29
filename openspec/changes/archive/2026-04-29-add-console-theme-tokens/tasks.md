## 1. Stash the design handoff under `docs/`

- [x] 1.1 Move `.scratch/claude-design/opendecktracker/` to `docs/design/opendecktracker/`. Keep README + chats + project files. Update `docs/design/opendecktracker/README.md` adding a small note that this is the source-of-truth for `add-console-theme-tokens` and follow-up Console UI changes.
- [x] 1.2 Add `docs/design/opendecktracker/.gitattributes` marking `*.html` and `*.jsx` as `text eol=lf` so cross-platform diffs stay clean.
- [x] 1.3 Commit with message `docs(design): import OpenDeckTracker UI design handoff`.

## 2. Token Foundation

- [x] 2.1 Add a failing smoke test `apps/desktop/src/renderer/tests/theme.test.ts` that imports `theme.css` via Vite's `?raw` suffix and asserts the file contains the substrings `--accent: #22d3ee;`, `--bg: #0b0f14;`, `--font-mono:` and `'JetBrains Mono'`. Run `pnpm --filter @hdt/desktop exec vitest run theme` and expect failure.
- [x] 2.2 Replace the contents of `apps/desktop/src/renderer/src/styles/theme.css`'s active `:root` block with the Console token table (per design.md D3). Keep the existing dead shadcn-style vars co-resident so other code that may reference them doesn't break. Run the smoke test and expect pass.
- [x] 2.3 Replace the contents of `apps/desktop/src/renderer/src/styles/fonts.css` with a single `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');`.
- [x] 2.4 Add a Tailwind v4 `@theme` block at the top of `apps/desktop/src/renderer/src/styles/tailwind.css` (after the `@import 'tailwindcss'` line) mapping each token to its utility class (per design.md D2 table). Verify the build with `pnpm --filter @hdt/desktop typecheck` and a dev-server probe that `bg-bg-2` resolves.
- [x] 2.5 Set the `body` element's `background: var(--bg);` and `color: var(--text);` and `font-family: var(--font-sans);` in `theme.css` so the renderer ships with the Console look out of the box.
- [x] 2.6 Run `pnpm --filter @hdt/desktop test` to confirm no existing test broke. Run `pnpm --filter @hdt/desktop typecheck` to confirm clean. Commit with `feat(renderer): add Console theme tokens + load Inter / JetBrains Mono`.

## 3. Sweep the Shell (high-traffic surfaces first)

- [x] 3.1 `Sidebar.tsx`: replace orange / gray-slate / hard-coded hex with token utilities. The active-tab inset rail uses `shadow-[inset_4px_0_0_0_var(--accent)]`. Hover background uses `bg-bg-2`. Run `pnpm --filter @hdt/desktop test -- Sidebar` and expect green.
- [x] 3.2 `App.tsx`: header + status pill, mode toggle, body background. Replace `bg-[#0E0E14]` → `bg-bg`, status pill colors → `text-green` / `text-amber` / `text-text-mute`. Run `pnpm --filter @hdt/desktop test -- App` and expect green.
- [x] 3.3 `Dashboard.tsx`: KPI summary cards, watcher status pill, rank label. Cyan replaces orange on the rank legend. Run `pnpm --filter @hdt/desktop test -- Dashboard` and expect green.
- [x] 3.4 Commit batch as `feat(renderer): retheme shell (Sidebar / App / Dashboard) with Console tokens`.

## 4. Sweep the Tracker + Overlay Surfaces

- [x] 4.1 `LiveDeckPanel.tsx`: replace card panel chrome (`bg-[#1a1a24]`, etc.) with `bg-bg-2`, accent on remaining-card counts becomes `text-accent`, draw-pop animation keyframe still references the literal orange in `theme.css` — port that to `var(--accent)`. Wrap every numeric (mana cost, ×N count, hand size in footer) in `font-mono`. Run `pnpm --filter @hdt/desktop test -- LiveDeckPanel` and expect green.
- [x] 4.2 `OpponentCardsPanel.tsx`: same sweep. Cyan accent for revealed-card counts.
- [x] 4.3 `OverlayView.tsx`: same sweep. Background uses `bg-bg`, panel border uses `var(--accent)` for the player overlay's outline.
- [x] 4.4 `CardImagePopover.tsx`: token sweep, no behavior change.
- [x] 4.5 `DeckSelectDialog.tsx`: pill/highlight states use `bg-accent-dim` + `border-accent` for the selected deck. Saved-deck "Saved" badge uses `bg-green/20` + `text-green`.
- [x] 4.6 Run `pnpm --filter @hdt/desktop test` (full suite) and expect green. Commit as `feat(renderer): retheme tracker + overlay + dialog surfaces with Console tokens`.

## 5. Sweep the Stats + Decks + Collection Surfaces

- [x] 5.1 `Stats.tsx`: time/format pills, summary cards, recent-match rows. Orange-amber-emerald palette → `text-accent` / `text-amber` / `text-green`. KPI numbers wrapped in `font-mono` (most already are).
- [x] 5.2 `FormatFilterPills.tsx`: active pill uses `bg-accent`, inactive uses `bg-bg-2`.
- [x] 5.3 `MatchupMatrix.tsx`: cell background colormap stays semantic (green/red/amber for high/low winrate) but uses token colors. Win-percentage text in `font-mono`.
- [x] 5.4 `WinrateTimeSeriesChart.tsx`: line color = `var(--accent)`, axis labels = `text-text-mute`.
- [x] 5.5 `PlayOrderSplitCard.tsx`: card backgrounds → `bg-bg-2`, percentages in `font-mono`.
- [x] 5.6 `MatchRecordingViewer.tsx`: list rows + close button use tokens.
- [x] 5.7 `Decklist.tsx` + `DecksPage.tsx` + `DeckEditor.tsx` + `DeckImportDialog.tsx` + `DeckExportDialog.tsx` + `SaveLiveDeckButton.tsx`: orange CTAs → `bg-accent text-bg`, card-count badges → `text-green` for legal, `text-amber` for incomplete.
- [x] 5.8 `Collection.tsx`: card grid borders + accent stay; orange CTA → cyan.
- [x] 5.9 `Settings.tsx`: language radio, toggles, headers — all token-driven.
- [x] 5.10 Run `pnpm --filter @hdt/desktop test` (full suite) and expect green. Commit as `feat(renderer): retheme stats + decks + collection + settings with Console tokens`.

## 6. Numeric `font-mono` enforcement sweep

- [x] 6.1 Audit `LiveDeckPanel.tsx` for any number rendered without `font-mono`. Wrap each in a `<span className="font-mono">`. Add `tabular-nums` where the number updates frequently (count badges, hand size, deck count).
      → Largely already in place; mana gem and ×N count already mono. Verified via grep + manual scan.
- [x] 6.2 Audit `Stats.tsx`, `Dashboard.tsx`, `MatchupMatrix.tsx`, `WinrateTimeSeriesChart.tsx`, `PlayOrderSplitCard.tsx`, `MatchRecordingViewer.tsx` — every percent / count / duration / timestamp has `font-mono`.
      → Stats.tsx KPI cards (Overall Winrate, Matches Played, Time Played, Best Deck) wrapped numerics in `font-mono tabular-nums`. Recent-match row's timestamp + duration wrapped. Other charts already mono via component design.
- [x] 6.3 Audit `Decklist.tsx`, `DeckEditor.tsx`, `DeckSelectDialog.tsx`, `Collection.tsx` — every numeric badge, version (`v2`), card-count (`16/30`), legendary count uses `font-mono`.
      → Verified during palette sweep; numerics in these files already mono.
- [x] 6.4 Run `pnpm --filter @hdt/desktop test` and expect green. Commit as `feat(renderer): wrap renderer numerics in font-mono with tabular-nums`.
      → 208/208 pass; `Stats.test.tsx` updated from `getByText('100%')` to `getAllByText('100%').length >= 1` because the new mono spans split a previously-shared text node.

## 7. Regression Hardening

- [x] 7.1 Repo-wide grep across the in-scope files (per design.md D6 list) for the patterns `#0E0E14`, `#1C1C24`, `#14141A`, `#2A2A35`, `#F97316`, `bg-orange-`, `text-orange-`, `border-orange-`, `text-slate-`, `bg-slate-`. Expect zero matches in the in-scope set.
      → Caught + fixed during cleanup: `routes.tsx` (`bg-[#0E0E14] border-[#2A2A35]`), `Stats.tsx` axis stroke `#64748B`, `Stats.tsx` recent-row red palette, `Decklist.tsx` delete confirm `bg-red-500`, `MatchupMatrix.tsx` red cells, `Collection.tsx` blue chip + button, `LiveDeckPanel.tsx` extras banner blue. All zero now (except domain-color allow-list — see 7.2).
- [x] 7.2 Append a `theme-token-grep` test in `theme.test.ts` (or a sibling) that runs the grep at test time over the in-scope file set and fails if any literal is found. Use Vite's `?raw` to load each file as text. Run and expect green after 3-5 are clean.
      → New file `apps/desktop/src/renderer/tests/theme-tokens-grep.test.ts`. 27 forbidden patterns; 4 allow-list rules covering: rarity tints (`text-purple-300` after `rarity === 'epic'`, `text-blue-300` after `rarity === 'rare'`) and the Hearthstone mana-gem chip (`bg-blue-700/40`/`text-blue-100` in LiveDeckPanel — domain blue across all themes per design's ManaGem primitive).
- [x] 7.3 Run `pnpm --filter @hdt/desktop typecheck` and expect exit code 0. → ✓
- [x] 7.4 Run `pnpm --filter @hdt/desktop test` and expect 200+ tests still green. → 208/208 ✓
- [x] 7.5 Run `npx openspec validate add-console-theme-tokens --strict` and expect "Change 'add-console-theme-tokens' is valid". → ✓
- [x] 7.6 Commit any final fixes; commit message `chore(renderer): lock console tokens via grep regression test`.

## 8. Manual Smoke + Archive

- [x] 8.1 Manual smoke: launch `pnpm dev`, verify cyan accent + slate background + JetBrains Mono numerics across Tracker, Decks (saved-decks list + editor + import/export dialogs), Stats (all four sections), Collection, Settings, Overlay tab. Toggle language to `zh-CN` and confirm fonts hold.
- [x] 8.2 Confirm draw-pop animation still works on LiveDeckPanel (the keyframe in `theme.css` references the orange — port to `var(--accent)` or to a Console-tinted highlight color before this step).
- [x] 8.3 Confirm `pnpm --filter @hdt/desktop test` is still green when `pnpm dev` is stopped.
- [x] 8.4 Archive change via `/opsx:archive add-console-theme-tokens`.
