## Why

`OverlayView` currently mounts the desktop `LiveDeckPanel` verbatim
inside the `/overlay` route. That panel is optimized for a wide,
focusable side panel: it expands every remaining copy into its own row,
plays a 2 s exit animation when a card is drawn, and renders rarity-
tinted text. Read at a glance during gameplay it's noisy — the user
mostly wants to know *"how many copies of X are left in my deck?"*
in one tick.

Pip counts are the at-a-glance answer: one row per unique card, with
small filled / hollow circles next to the name showing remaining /
legal-max. Filled = still in deck. Hollow = drawn. The row fades when
count hits 0. This change introduces a compact pip-count variant of
`LiveDeckPanel` and wires it into `OverlayView`, leaving the desktop
tracker layout untouched.

## What Changes

- **NEW** prop `compact?: boolean` on `LiveDeckPanel` (default `false`).
  When `true`, the panel renders one row per unique cardId (collapsed
  from the existing `expandDeckToCopies` output) with a pip indicator
  to the right of the card name.
- **NEW** `apps/desktop/src/renderer/src/components/CardPips.tsx`:
  small renderless-styled component that takes
  `{ remaining: number; max: number }` and renders up to `max` dots,
  the first `remaining` filled with `var(--accent)`, the rest hollow
  (border-only). Dots are 6×6 px, gap-1, right-aligned.
- **NEW** in `LiveDeckPanel`'s compact branch: rows with
  `remaining === 0` are dimmed (`opacity-40`, no rarity tint) but stay
  visible — gives the user "what's still possible" at a glance.
- **MODIFIED** `OverlayView.tsx` to pass `compact` to `LiveDeckPanel`.
  The desktop `/` route's tracker keeps the per-copy expansion +
  exit-animation behavior unchanged.
- **NEW** i18n keys reused — no new strings (the compact variant
  shows the same name + cost chip; pip rendering is purely visual).
- **NEW** unit tests:
  - `CardPips.test.tsx`: pure rendering — N filled / (max - N) hollow,
    legendary case (max = 1), all-drawn case (0 filled).
  - `LiveDeckPanel.compact.test.tsx`: when `compact={true}`, the panel
    renders **one** row per cardId (not N), the pip widget is present,
    drawn-to-zero rows render with `opacity-40`, and the 2 s exit
    animation does **not** fire (compact rows fade rather than slide).
  - `OverlayView.test.tsx` smoke: passes `compact={true}` down.

Non-goals:
- No separate transparent BrowserWindow (deferred to
  `add-opponent-overlay-window`). The overlay still lives at the
  `#/overlay` hash route inside the main window for now.
- No change to the desktop tracker layout — per-copy rows + exit
  animation stay as they are.
- No change to the OpponentCardsPanel.
- No new IPC, no new stores, no new theme tokens.
- No "show all copies as pips" alternative for the desktop tracker
  (out of scope; this is overlay-only).

## Capabilities

### New Capabilities
<!-- None — this is a pure renderer-side variant of an existing component. -->

### Modified Capabilities
- `deck-tracker-core`: the existing requirement on `LiveDeckPanel`
  rendering needs an addendum to allow the compact variant for the
  overlay surface, with explicit scenarios for pip rendering and the
  drawn-to-zero dimmed state.

## Impact

- `apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx` —
  add `compact?: boolean` prop, branch the render path; existing
  per-copy logic still drives the desktop variant.
- `apps/desktop/src/renderer/src/components/CardPips.tsx` (new).
- `apps/desktop/src/renderer/src/components/OverlayView.tsx` — pass
  `compact={true}`.
- Three new test files; no existing tests need updating.
- No package-level changes outside `apps/desktop/src/renderer/`.
