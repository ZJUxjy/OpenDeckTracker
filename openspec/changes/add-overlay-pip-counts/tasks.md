# Implementation Tasks

## 1. CardPips Component

- [x] 1.1 Add failing tests in `apps/desktop/src/renderer/tests/CardPips.test.tsx` covering: (a) `<CardPips remaining={2} max={2} />` renders 2 filled dots; (b) `<CardPips remaining={1} max={2} />` renders 1 filled + 1 hollow; (c) `<CardPips remaining={0} max={2} />` renders 2 hollow; (d) `<CardPips remaining={1} max={1} />` (legendary) renders exactly 1 filled dot; (e) `<CardPips remaining={5} max={2} />` clamps to 2 filled (defensive). Use `data-testid` markers (`pip-filled` / `pip-hollow`) so the assertions don't depend on color literals. Run; expect failure.
- [x] 1.2 Create `apps/desktop/src/renderer/src/components/CardPips.tsx`. Pure stateless component. Use `bg-accent` for filled and `border border-border` (transparent fill) for hollow. Add `transition-colors` so a fill change animates without layout shift. Run tests; expect pass.
- [x] 1.3 Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0.
- [x] 1.4 Commit with message `feat(desktop): add CardPips component`.

## 2. LiveDeckPanel Compact Variant

- [x] 2.1 Add failing tests in `apps/desktop/src/renderer/tests/LiveDeckPanel.compact.test.tsx` covering:
  - (a) given a snapshot with `Fireball x2`, `Frostbolt x2`, `Alexstrasza x1`, rendering `<LiveDeckPanel compact />` produces exactly 3 rows (one per cardId), not 5;
  - (b) the Fireball row contains a `CardPips` widget reflecting `remaining=1, max=2` after a draw — assert via the rendered pip count;
  - (c) a row with `remaining=0` carries `opacity-40` (assert via class on the row container);
  - (d) the `animate-deck-exit` class is NOT applied to any row in the compact branch even when `remaining` drops to 0 between snapshots (use a fixture with two consecutive snapshots);
  - (e) the desktop variant (`<LiveDeckPanel />` without compact) still renders per-copy rows on the same fixture (sanity check that we did not regress).
  Run; expect failure.
- [x] 2.2 Modify `LiveDeckPanel.tsx`:
  - Add the `compact?: boolean` prop. Default `false`.
  - Branch the in-match render path on `compact`. The existing per-copy path stays as the `else` (default) branch.
  - In the compact branch, sort `deck.remaining` by `(cost ascending, name ascending, cardId ascending)` using the same comparator the desktop branch already uses (extract to a small helper if needed).
  - For each remaining-entry, look up `original = deck.original.find(o => o.cardId === e.cardId)?.count ?? e.count` and render `<CardPips remaining={e.count} max={Math.max(original, e.count)} />`.
  - Add a separate row branch for cards with `original > 0` but missing from `remaining` (count = 0): render dimmed with all-hollow pips. Use a Map to detect them.
  - Keep existing header, footer, hover popover, empty states intact.
  Run tests; expect pass.
- [x] 2.3 Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0.
- [x] 2.4 Run the regression token grep (`tests/theme-tokens-grep.test.ts`); expect pass.
- [x] 2.5 Commit with message `feat(desktop): add compact pip-count variant to LiveDeckPanel`.

## 3. Overlay Wiring

- [x] 3.1 Add failing test in `apps/desktop/src/renderer/tests/OverlayView.test.tsx`: assert that the `<LiveDeckPanel />` rendered inside `<OverlayView />` receives `compact={true}`. Use a `vi.spyOn(...)` on the `LiveDeckPanel` module export, OR a `data-testid` round-trip where the compact branch leaves a marker (`data-overlay-compact="true"`) on the root `<aside>`. Prefer the latter since spying on React module exports is fragile. Run; expect failure.
- [x] 3.2 Update `OverlayView.tsx` to pass `compact={true}` to `<LiveDeckPanel />`. If using the `data-testid` round-trip approach, add the `data-overlay-compact` attribute on the compact branch's root `<aside>`.
- [x] 3.3 Run all renderer tests (`pnpm --filter @hdt/desktop exec vitest run`); expect green outside the pre-existing sqlite-ABI suite.
- [x] 3.4 Commit with message `feat(desktop): wire OverlayView to LiveDeckPanel compact variant`.

## 4. Final Validation and Archive

- [ ] 4.1 Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0.
- [ ] 4.2 Run `npx openspec validate add-overlay-pip-counts --strict`; expect "Change … is valid".
- [ ] 4.3 Manual smoke: launch `pnpm dev`, navigate to `#/`, verify the desktop tracker still uses per-copy rows + slide-out animation. Navigate to `#/overlay`, verify the deck panel shows pip counts (one row per cardId, dim when drawn to zero). Toggle locale to zh-CN and confirm row labels still render correctly.
- [ ] 4.4 Run `git status` to confirm only in-scope files changed.
- [ ] 4.5 Archive change via `/opsx:archive add-overlay-pip-counts`.
