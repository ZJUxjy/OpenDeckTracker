## Why

Comparing our `LiveDeckPanel` rows to Firestone's deck tracker
(reference screenshot at `D:\code\HDT_js\ScreenShot_2026-05-04_224538_590.png`)
exposes two gaps that hurt at-a-glance readability during a match:

1. **No rarity signal on the row itself.** Today only the card *name*
   text gets a rarity tint (`text-purple-300` / `text-blue-300` /
   `text-accent`), and Free / Common are indistinguishable. Players
   have to read the name to know if a card is a legendary topdeck.
   Firestone tints the whole left edge of the row by rarity (grey /
   white / blue / purple / orange), so rarity registers in
   peripheral vision.
2. **No card art on the row.** Our rows are pure text + a flat
   `bg-blue-700/40` cost cell. Firestone bleeds the card portrait in
   from the right edge of each row, which gives instant visual
   recognition (faster than reading 30 names every turn).

The card-image cache infrastructure (`feat(desktop): cache card
images locally`) already serves portraits, and `CardDef.rarity`
already arrives from `@hdt/hearthdb`, so this is a renderer-only
visual upgrade — no IPC, no schema, no new data sources.

## What Changes

- **MODIFIED** `LiveDeckPanel`'s desktop card row (`CardCopyRow`):
  - Cost cell gains a rarity-derived tint (replaces the hard-coded
    `bg-blue-700/40`). Mapped via new theme tokens.
  - Row gains a card-portrait background sliver bled in from the
    right edge — uses `useCardImageUrl(cardId)` (already cached) and
    a left-to-right gradient overlay so the card name stays
    readable over busy artwork.
  - The existing per-rarity name-text tint stays, but is rewired to
    use the new tokens for consistency (no new ad-hoc colors).
- **MODIFIED** `LiveDeckPanel`'s overlay compact row (`CompactCardRow`):
  - Same cost-cell tint and same right-edge portrait background.
  - The pip widget on the right rides on top of the gradient mask;
    pip dots remain `var(--accent)` so they read against any art.
  - Spent rows (`remaining === 0`) keep their existing
    reduced-opacity treatment and the portrait fades alongside the
    rest of the row.
- **NEW** Five rarity color tokens in
  `apps/desktop/src/renderer/src/styles/theme.css` `:root`, exposed
  as Tailwind utilities via `@theme`:
  - `--rarity-free`     → neutral grey
  - `--rarity-common`   → off-white
  - `--rarity-rare`     → blue
  - `--rarity-epic`     → purple
  - `--rarity-legendary` → orange (Hearthstone canonical)
  Plus a `getRarityToken(rarity?: Rarity): string` helper exported
  from a new `apps/desktop/src/renderer/src/lib/rarity.ts` so both
  row variants and any future rarity-bearing UI share one mapping.
- **MODIFIED** Console-token spec: extend the canonical token table
  with the 5 rarity tokens and document the rarity helper.

**Non-goals** (deferred):

- Animating the card portrait on draw/exit. The existing
  `animate-deck-exit` slide-out keeps fading the whole row including
  the portrait — no new keyframes.
- Card frame embellishments (gem socket, dragon overlays, etc.).
  Just the portrait sliver, not the full Hearthstone card frame.
- Replacing `CardPips` with anything fancier. Pips stay accent-cyan.
- Touching the in-app saved-deck list, the deck editor, or the deck
  finder. Only the live `LiveDeckPanel` (both variants).
- Showing the portrait inside the empty/loading states.
- Reading rarity off `snapshot.deck.original` entries — rarity comes
  from `@hdt/hearthdb` (`useCardDef`) which is already wired.

## Capabilities

### New Capabilities

(none — both behaviors fit into existing capabilities)

### Modified Capabilities

- `deck-tracker-core`: extends the existing `LiveDeckPanel supports
  per-copy rows…` and `LiveDeckPanel exposes a compact pip-count
  variant…` requirements with rarity-tint and card-art rendering
  rules. Adds a new requirement covering the shared
  `getRarityToken` helper.
- `console-theme-tokens`: extends the canonical token table with
  the five `--rarity-*` tokens and exposes them as Tailwind
  utilities (`bg-rarity-legendary`, `text-rarity-legendary`, etc.).

## Impact

- `apps/desktop/src/renderer/src/styles/theme.css` — add 5
  `--rarity-*` declarations to `:root`.
- `apps/desktop/src/renderer/src/styles/tailwind.css` — extend the
  `@theme` block with `--color-rarity-*` mappings so Tailwind
  utilities like `bg-rarity-legendary` resolve.
- `apps/desktop/src/renderer/src/lib/rarity.ts` (new) — single
  mapping `Rarity → token name`, `getRarityToken(rarity?: Rarity)`,
  `getRarityCostBg(rarity?: Rarity)` helpers.
- `apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx` —
  rewire `CardCopyRow` + `CompactCardRow` to: (a) render a portrait
  background using `useCardImageUrl`, (b) tint the cost cell via
  `getRarityCostBg`, (c) keep the gradient mask + text shadow over
  the portrait so names stay legible.
- `apps/desktop/src/renderer/tests/LiveDeckPanel.test.tsx` +
  `.compact.test.tsx` — extend existing tests with rarity-cell and
  portrait assertions.
- No new Tailwind plugins, no new dependencies. The
  `useCardImageUrl` hook and `window.hdt.cardImages` IPC remain
  unchanged.
- No DB / IPC schema migrations.
- No renderer-API surface changes — the panel's prop signature
  stays `{ compact?: boolean }`.
