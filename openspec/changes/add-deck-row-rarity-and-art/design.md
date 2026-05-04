## Context

`LiveDeckPanel.tsx` renders two row variants today:

- `CardCopyRow` (desktop / regular): one row per physical copy.
  Cost cell is a flat `bg-blue-700/40` square; name uses a partial
  rarity tint via Tailwind `text-purple-300` / `text-blue-300` /
  `text-accent` (legendary). Free vs Common is invisible.
- `CompactCardRow` (overlay variant `compact = true`): one row per
  cardId with a pip widget. Same flat cost cell. No rarity tint at
  all on names today.

Both variants are pure text — no card portrait. The
`useCardImageUrl(cardId)` hook (`apps/desktop/src/renderer/src/hooks/use-card-image-url.ts`)
already serves cached portrait URLs through `window.hdt.cardImages`.

Reference: Firestone screenshot
`D:\code\HDT_js\ScreenShot_2026-05-04_224538_590.png` shows the
target — rarity-tinted left edge / cost gem and the card portrait
bleeding in from the right with a left-fading gradient.

Constraints carried over from previous changes:

- Console-token discipline (`console-theme-tokens` spec, `Renderer
  surfaces consume tokens, not raw color literals`): no ad-hoc
  hex / Tailwind palette utilities in renderer source. New colors
  enter via the `:root` token table.
- Click-through (`overlay-window` spec): the overlay route uses
  `pointer-events: none` on the root, `auto` on panel islands. Must
  not regress.
- IN_MATCH visibility gate (commit `f638e2c`): visibility logic
  doesn't touch row internals — safe by construction.

## Goals / Non-Goals

**Goals:**

- Players can read rarity at a glance from the cost cell colour.
- Players can recognize cards by portrait without reading text.
- One mapping `Rarity → token` shared by both row variants.
- Card name remains legible over busy artwork.
- Zero new dependencies; renderer-only.

**Non-Goals:**

- Animating the portrait on enter/exit (no new keyframes — existing
  `animate-deck-exit` keeps fading the whole row).
- Replicating the Hearthstone card frame (gem socket, dragon
  decorations). Just the portrait sliver.
- Showing the portrait in empty/loading states or in saved-deck
  list / deck editor / deck finder.
- Touching `OpponentCardsPanel` or pip-count visuals.
- Changing IPC, store shape, or `useCardDef` / `useCardImageUrl`.

## Decisions

### D1. Source rarity from `useCardDef`, not from snapshot entries

**Context:** `snapshot.deck.original` and `snapshot.deck.remaining`
entries carry only `{ cardId, count }`. Rarity lives on `CardDef`
(from `@hdt/hearthdb`).

**Options:**

a. Pipe rarity through the snapshot DTO — requires changes to core
   types and IPC.
b. Read it via the existing `useCardDef(cardId)` hook each row
   already uses for `cost`/`name`.

**Choice: (b).** Zero non-renderer surface changes. `useCardDef` is
already called per-row in both variants; adding `def?.rarity` is a
free read.

### D2. Rarity → token mapping lives in `lib/rarity.ts` (single source)

**Context:** Two row variants need the same mapping. Inline
switch-case in each component duplicates the mapping and breaks
when we add the helper for, say, the deck editor later.

**Options:**

a. Inline `switch` in each row component.
b. A helper module `apps/desktop/src/renderer/src/lib/rarity.ts`
   exporting `getRarityToken(rarity?: Rarity)`,
   `getRarityCostBg(rarity?: Rarity)`.

**Choice: (b).** DRY, testable in isolation, future-proof. The
helper accepts `undefined` (some cards have no rarity in test
fixtures) and falls back to `--rarity-common` / neutral.

### D3. Token names: semantic (`--rarity-legendary`) not numeric

**Context:** Existing token table uses semantic names
(`--accent`, `--bg-2`, `--text-mute`). Rarity tokens follow suit
to stay consistent with the spec's existing pattern.

**Token values:**

| Token                  | Value             | Rationale                  |
|------------------------|-------------------|----------------------------|
| `--rarity-free`        | `#5b6573`         | Same as `--text-mute` family — barely-there grey for token cards |
| `--rarity-common`      | `#cdd5e0`         | Off-white, mirrors HS card-frame "common" gem |
| `--rarity-rare`        | `#3b82f6`         | Standard rare blue (Tailwind `blue-500` baseline, but expressed as a token here) |
| `--rarity-epic`        | `#a855f7`         | Standard epic purple |
| `--rarity-legendary`   | `#f59e0b`         | HS canonical orange-gold (matches Firestone) |

Each is exposed as Tailwind utilities `bg-rarity-legendary`,
`text-rarity-legendary`, `border-rarity-legendary` via the
`@theme` directive.

### D4. Cost-cell rarity treatment: tint background, not just border

**Options:**

a. Tinted left border only (subtle).
b. Tinted full cost-cell background, white/dark text on top.
c. Both — left rail of the row + cost cell.

**Choice: (b).** Firestone's reference uses the full cost cell
tint, which is the strongest at-a-glance signal in our 24-px row
height. (a) is too subtle at our row size; (c) creates two visual
weights competing on the left. We use `bg-rarity-<r>/70` so the
hue is unambiguous but the cell still sits under the row's
foreground text contrast.

The cell text colour stays `text-bg` (dark) for `legendary`/`rare`/`epic`/`common` so the cost number reads, and `text-text` for `free`/unknown which use a darker token. Implementation pre-computes via `getRarityCostBg(rarity)`.

### D5. Portrait rendering: absolutely-positioned `<img>` + gradient mask

**Options:**

a. CSS `background-image` on the row container with `background-size: cover` and a gradient overlay.
b. An absolutely-positioned `<img>` element clipped on the right side, with a `linear-gradient(to right, var(--bg-2), transparent)` overlay element on top to fade it into the row's background.
c. Use the existing `CardImagePopover` rendering inline.

**Choice: (b).** Reasons:

- We need the `onError` handler to fall back to the `enUS`
  primary URL (the existing `useCardImageUrl` returns
  `{ primary, fallback }`).
- A real `<img>` plays nicely with the renderer's image cache and
  with React's lazy-loading semantics; CSS `background-image`
  fights both.
- We can position-absolute the `<img>` clipped to the right ~60%
  of the row, then place the `<div>` gradient overlay above it to
  fade text-side legibility back in. Z-index: portrait z-0,
  gradient z-1, content z-2.

(c) brings popover-styled chrome we don't want for the inline
sliver.

### D6. Compact variant keeps pip widget visible above the portrait

The pip widget already sits on the right edge. Stacking order
inside the row, right to left:

```
[portrait img (absolute)] → [right-fading gradient overlay] → [pip widget (z-2)]
```

This means pips read against the gradient (not the raw portrait),
preserving the existing accent contrast. The cost cell, name, and
pip widget all live in the foreground layer (z-2). No layout shift.

### D7. Spent (compact, `remaining === 0`) rows fade the portrait too

The existing rule already wraps the row in `opacity-40`. The
portrait is inside that wrapper, so it fades alongside the rest —
no extra CSS work. The reduced opacity also softens the rarity tint
(intentional: spent rows shouldn't compete with live ones).

### D8. Test strategy

- New helper `lib/rarity.ts` — pure-function unit tests.
- `LiveDeckPanel.test.tsx` (desktop) — assert the cost cell renders
  with the correct `bg-rarity-<rarity>` utility for a known card
  fixture; assert an `<img>` element with `data-testid="card-row-art"`
  is present.
- `LiveDeckPanel.compact.test.tsx` — same assertions for the
  compact variant; spent row asserts the wrapping `opacity-40`
  still applies and the portrait `<img>` remains in the DOM.
- No new Playwright/E2E.

## Risks / Trade-offs

- [Risk] Card name unreadable over busy artwork → Mitigation:
  the gradient overlay (`from-bg-2/95` to transparent ~60% across)
  + a `text-shadow: 0 1px 2px rgba(0,0,0,0.7)` on the row's
  foreground text. Combined effect verified against Firestone's
  busiest cards (Reno, Ysera) in design review of the screenshot.
- [Risk] Cost-cell colours fail WCAG against cell text →
  Mitigation: cost text uses `text-bg` (very dark) on bright tints
  and `text-text` (light) on `--rarity-free`. Mapped explicitly in
  `getRarityCostBg`, not derived per-component.
- [Risk] Portrait image fetch failures spam the renderer console
  during a fresh install → Mitigation: `<img onError>` already
  handled by `markFallback` + the existing `useCardImageUrl`
  fallback chain. We don't introduce any new error paths.
- [Trade-off] `--rarity-rare`, `--rarity-epic`, `--rarity-legendary`
  are NOT pure Tailwind palette colours — we deliberately spell
  them out as tokens to stay consistent with the existing
  `console-theme-tokens` discipline (no `bg-blue-500` /
  `bg-purple-500` raw utilities). Cost: 5 extra tokens in the
  table, gain: zero raw-palette usages anywhere.
- [Trade-off] We don't change `OpponentCardsPanel` row rendering in
  this change. The opponent panel is tracked under a separate
  capability and lives in a different part of the surface; its
  rarity treatment is a follow-up if/when product asks.

## Migration Plan

- No data migration. Renderer-only.
- Rollback: revert the touching commits (LiveDeckPanel, theme.css,
  tailwind.css, lib/rarity.ts). The store/IPC are untouched, so a
  rollback affects nothing else.

## Open Questions

(none — all decisions above are concrete.)
