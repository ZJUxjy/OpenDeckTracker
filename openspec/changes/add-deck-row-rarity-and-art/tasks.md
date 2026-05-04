# Implementation Tasks

## 1. Rarity tokens in theme.css + Tailwind utilities

- [x] 1.1 Open `apps/desktop/src/renderer/src/styles/theme.css` and locate the `:root` block defining `--bg`, `--accent`, etc. After the `--amber: #fbbf24;` line, insert five lines: `--rarity-free: #5b6573;`, `--rarity-common: #cdd5e0;`, `--rarity-rare: #3b82f6;`, `--rarity-epic: #a855f7;`, `--rarity-legendary: #f59e0b;`.
- [x] 1.2 Find the existing `theme.css` smoke test (likely `apps/desktop/src/renderer/tests/theme-tokens.test.ts` or similar — `grep -l "theme.css" apps/desktop/src/renderer/tests`). Add a failing assertion: read the file as raw text and assert it contains substrings `--rarity-free:`, `--rarity-common:`, `--rarity-rare:`, `--rarity-epic:`, `--rarity-legendary:`. Run `pnpm --filter @hdt/desktop test theme-tokens` (or equivalent); expect green now (after step 1.1).
- [x] 1.3 Open `apps/desktop/src/renderer/src/styles/tailwind.css`. Locate the `@theme { ... }` block. Add five entries inside it: `--color-rarity-free: var(--rarity-free);`, `--color-rarity-common: var(--rarity-common);`, `--color-rarity-rare: var(--rarity-rare);`, `--color-rarity-epic: var(--rarity-epic);`, `--color-rarity-legendary: var(--rarity-legendary);`. (Tailwind v4 derives `bg-rarity-*`, `text-rarity-*`, `border-rarity-*` utilities from `--color-*` tokens automatically.)
- [x] 1.4 Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0. Run `pnpm --filter @hdt/desktop dev:vite --build` (or the renderer's existing build script) on a tiny smoke fixture using `bg-rarity-legendary` and confirm the produced CSS resolves to `var(--rarity-legendary)`. (If no quick build harness exists, defer the build check to step 4 acceptance.)
- [x] 1.5 Commit: `feat(renderer): add rarity color tokens to Console theme`.

## 2. lib/rarity.ts helper module

- [x] 2.1 Create `apps/desktop/src/renderer/tests/rarity.test.ts` with failing tests:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { getRarityToken, getRarityCostBg } from '../src/lib/rarity';

  describe('getRarityToken', () => {
    it('maps each known rarity', () => {
      expect(getRarityToken('FREE')).toBe('--rarity-free');
      expect(getRarityToken('COMMON')).toBe('--rarity-common');
      expect(getRarityToken('RARE')).toBe('--rarity-rare');
      expect(getRarityToken('EPIC')).toBe('--rarity-epic');
      expect(getRarityToken('LEGENDARY')).toBe('--rarity-legendary');
    });
    it('falls back to common for undefined', () => {
      expect(getRarityToken(undefined)).toBe('--rarity-common');
    });
  });

  describe('getRarityCostBg', () => {
    it('returns bg-rarity-<r> with a token-only text class', () => {
      const cls = getRarityCostBg('LEGENDARY');
      expect(cls).toContain('bg-rarity-legendary');
      expect(cls).toMatch(/text-(bg|text|rarity-)/);
    });
    it('uses light text on the dark FREE tint', () => {
      expect(getRarityCostBg('FREE')).toContain('text-text');
    });
    it('falls back to common when undefined', () => {
      expect(getRarityCostBg(undefined)).toContain('bg-rarity-common');
    });
  });
  ```
  Run `pnpm --filter @hdt/desktop test rarity`; expect failure (module missing).
- [x] 2.2 Create `apps/desktop/src/renderer/src/lib/rarity.ts`:
  ```ts
  import type { Rarity } from '@hdt/hearthdb';

  const TOKEN: Record<Rarity, string> = {
    FREE: '--rarity-free',
    COMMON: '--rarity-common',
    RARE: '--rarity-rare',
    EPIC: '--rarity-epic',
    LEGENDARY: '--rarity-legendary',
  };

  export function getRarityToken(rarity?: Rarity): string {
    return rarity && TOKEN[rarity] ? TOKEN[rarity] : '--rarity-common';
  }

  const COST_BG: Record<Rarity, string> = {
    FREE: 'bg-rarity-free text-text',
    COMMON: 'bg-rarity-common text-bg',
    RARE: 'bg-rarity-rare text-bg',
    EPIC: 'bg-rarity-epic text-bg',
    LEGENDARY: 'bg-rarity-legendary text-bg',
  };

  export function getRarityCostBg(rarity?: Rarity): string {
    return rarity && COST_BG[rarity] ? COST_BG[rarity] : COST_BG.COMMON;
  }
  ```
  Run `pnpm --filter @hdt/desktop test rarity`; expect green.
- [x] 2.3 Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0.
- [x] 2.4 Commit: `feat(renderer): add lib/rarity.ts with getRarityToken + getRarityCostBg`.

## 3. CardCopyRow (desktop variant): rarity tint + portrait

- [x] 3.1 Open `apps/desktop/src/renderer/tests/LiveDeckPanel.test.tsx`. Add failing assertions inside the existing in-match render test (or a new test if cleaner): given a fixture row whose card def has `rarity === 'LEGENDARY'`, find the cost cell via `[data-testid="card-copy-row"] > div:first-child` and assert its className contains `bg-rarity-legendary`. Then assert `screen.queryAllByTestId('card-row-art').length` equals the number of expected rows (one `<img data-testid="card-row-art">` per row). Run; expect failure.
- [x] 3.2 Open `apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx`. In `CardCopyRow`:
  - Import: add `import { getRarityCostBg } from '../lib/rarity';` and `import { useCardImageUrl } from '../hooks/use-card-image-url';` near the existing imports.
  - Inside the component, after `const rarity = ...`, replace it with `const rarity = def?.rarity;` (typed `Rarity | undefined`); also call `const { primary, fallback } = useCardImageUrl(cardId);`.
  - Change the row container to be `relative overflow-hidden` (so the absolute-positioned portrait clips inside the row).
  - Replace the cost cell's hard-coded `bg-blue-700/40 ... text-blue-100` classes with `getRarityCostBg(rarity)` and add `relative z-10` so the cost cell stays above the portrait layer.
  - Wrap the existing flex children in a `<div className="relative z-10 flex items-center w-full">` so the foreground content sits above the portrait. Keep the cost cell's existing `w-7 h-7 rounded ... flex items-center justify-center font-bold text-xs shrink-0` size classes.
  - Insert immediately inside the row container (BEFORE the foreground wrapper):
    ```tsx
    <img
      src={primary}
      onError={(e) => { (e.currentTarget as HTMLImageElement).src = fallback; }}
      data-testid="card-row-art"
      alt=""
      aria-hidden
      className="absolute right-0 top-0 h-full w-3/5 object-cover object-right pointer-events-none select-none z-0"
    />
    <div
      aria-hidden
      className="absolute inset-0 bg-gradient-to-r from-bg-2 from-35% to-transparent to-75% pointer-events-none z-[1]"
    />
    ```
  - Apply a text shadow to the row's name `<div>` by adding `style={{ textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}` (since Tailwind v4 has no `text-shadow-*` utility).
  - Update the rarity-color text classes on the name `<div>` to use the new tokens (`text-rarity-legendary`, `text-rarity-epic`, `text-rarity-rare`) instead of `text-accent` / `text-purple-300` / `text-blue-300`.
- [x] 3.3 Run `pnpm --filter @hdt/desktop test LiveDeckPanel.test`; expect green.
- [x] 3.4 Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0.
- [x] 3.5 Commit: `feat(desktop): tint CardCopyRow cost cell by rarity + bleed-in portrait art`.

## 4. CompactCardRow (overlay variant): rarity tint + portrait + pip layering

- [x] 4.1 Open `apps/desktop/src/renderer/tests/LiveDeckPanel.compact.test.tsx`. Add failing assertions:
  - Given a fixture compact row whose card def has `rarity === 'EPIC'`, find the cost cell of that row and assert its className contains `bg-rarity-epic`.
  - Assert `screen.queryAllByTestId('card-row-art').length` equals the number of compact rows.
  - Add a spent-row case: a row with `remaining === 0` MUST still render its `<img data-testid="card-row-art">` (it's just visually faded by the parent's `opacity-40`). Assert the row container has `opacity-40` and contains the portrait img.
  Run; expect failure.
- [x] 4.2 Update `CompactCardRow` in `apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx`:
  - Same imports as step 3.2 (`getRarityCostBg`, `useCardImageUrl`).
  - Add `const rarity = def?.rarity;` and `const { primary, fallback } = useCardImageUrl(cardId);`.
  - Make the row container `relative overflow-hidden` (in addition to the existing classes).
  - Insert the portrait `<img>` and gradient `<div>` (same JSX as step 3.2) as the first two children of the row container.
  - Wrap the cost cell + name + `<CardPips>` in a `<div className="relative z-10 flex items-center w-full">`.
  - Replace the cost cell's `bg-blue-700/40 ... text-blue-100` classes with `getRarityCostBg(rarity)`. Spent rows (`spent === true`) MUST keep using the rarity tint (the wrapper's `opacity-40` already softens it; the rarity-tint-disabled rule from the spec is satisfied by the visual fade, not by class removal).
  - Apply the text shadow on the name `<div>` (same as step 3.2).
- [x] 4.3 Confirm `<CardPips>` already sits inside the wrapper that gets `z-10` — pips MUST render above the gradient. (CardPips.tsx itself does not need changes.)
- [x] 4.4 Run `pnpm --filter @hdt/desktop test LiveDeckPanel.compact`; expect green.
- [x] 4.5 Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0.
- [x] 4.6 Commit: `feat(desktop): tint CompactCardRow cost cell by rarity + bleed-in portrait art`.

## 5. Final validation and archive

- [x] 5.1 Run `pnpm --filter @hdt/desktop typecheck`; expect exit 0.
- [x] 5.2 Run the full renderer test suite: `pnpm --filter @hdt/desktop test`; expect green (excluding any pre-existing failures the repo currently tolerates — confirm new failures are zero).
- [x] 5.3 Run `npx openspec validate add-deck-row-rarity-and-art --strict`; expect "Change ... is valid".
- [ ] 5.4 Manual smoke (Hearthstone running, in match): launch `pnpm dev`, enter a real match. Confirm: (a) each desktop tracker row's cost cell is tinted by rarity (a quick visual scan should see grey/white/blue/purple/orange); (b) the card portrait bleeds in from the right, name remains readable; (c) the same applies to the in-game overlay (compact variant) with pips remaining clearly visible above the artwork; (d) drawing a card still triggers the slide-out animation on the desktop variant; (e) spent rows in the compact variant fade portrait + tint together.
- [ ] 5.5 Manual smoke (no card image cache hit): clear `resources/card-images/` (or temporarily move it aside), launch the app, enter a match. Confirm rows still render legibly (URL fallback to fallback locale; no broken-image icons visible). Restore the cache.
- [ ] 5.6 `git status` shows only in-scope files: `theme.css`, `tailwind.css`, `lib/rarity.ts`, `tests/rarity.test.ts`, `LiveDeckPanel.tsx`, `tests/LiveDeckPanel.test.tsx`, `tests/LiveDeckPanel.compact.test.tsx`, plus the openspec change folder.
- [ ] 5.7 Archive change via `npx openspec archive add-deck-row-rarity-and-art --yes`. Verify the archive applied deltas to `openspec/specs/console-theme-tokens/spec.md` and `openspec/specs/deck-tracker-core/spec.md`.
