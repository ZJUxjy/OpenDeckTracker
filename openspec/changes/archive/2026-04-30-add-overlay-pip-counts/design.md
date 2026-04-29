## Context

`LiveDeckPanel` (260 px wide) is the same component rendered on the
desktop tracker (`/`) and inside `OverlayView` (`/overlay`). It uses
`expandDeckToCopies` to produce one DOM row per physical copy of a
card, then plays a 2 s slide-out animation when a row's
`remainingCount` drops to 0. That behavior is delightful when the
panel is focused and ~250 ms wide of attention can be spent — it is
disruptive when the panel is overlaid on Hearthstone's playfield and
the user wants a glance, not a story.

`OverlayView` itself is just a route inside the existing main
BrowserWindow. There is no transparent always-on-top window yet
(`add-opponent-overlay-window` is the change that wires that). For
now, the overlay route is what users open in a second monitor or
windowed-borderless setup.

## Goals / Non-Goals

**Goals:**
- The overlay shows one row per unique remaining cardId with a pip
  indicator (filled = remaining, hollow = drawn).
- Drawing a copy updates pips in place; no slide-out, no row
  reordering, no row removal until `0/N` is reached and the row is
  dimmed.
- The desktop tracker layout is byte-for-byte unchanged.

**Non-Goals:**
- No transparent BrowserWindow.
- No tooltip / hover / image popover changes.
- No animation budget beyond the pip's natural CSS transition on
  fill (color-only, no size change).
- No support for >2 pips. Hearthstone's legal-max is 1 (legendary)
  or 2 (everything else). The component's `max` prop accepts any
  value but we only ever pass 1 or 2 from `LiveDeckPanel`.

## Decisions

### D1 — Variant prop vs separate component

**Context.** Adding a `compact` boolean is the smallest API; making
`LiveDeckPanelCompact` a sibling component duplicates the empty-state
plumbing, the snapshot subscription, and the header.

**Choice.** Single component, `compact?: boolean` prop.

**Rationale.** The empty / pre-match / no-deck states are identical
in both variants. Only the "in-match" branch differs — and only its
row rendering, not the surrounding shell. A boolean prop keeps the
file at one ownership boundary; a sibling component would force
either a shared internal helper or duplicated subscriptions.

### D2 — Row collapse strategy

**Context.** The existing render path uses
`expandDeckToCopies(deck.remaining)` and sorts the result. For the
compact variant we want one row per unique cardId — the same set
the desktop variant has *before* expansion.

**Choice.** Sort `deck.remaining` directly (the unsorted source the
pre-existing `expandDeckToCopies` consumes) using the same comparator
keyed by cost / name / cardId. No new aggregation logic; the data is
already grouped.

**Rationale.** `deck.remaining` is already
`{ cardId, count }[]` from the snapshot. Sorting it gives exactly the
unique-cardId row list we need, with `count` driving the filled-pip
count. We never call `expandDeckToCopies` in the compact path.

### D3 — Pip max derivation

**Context.** A pip widget needs to know whether the card is
legendary (1 pip) or not (2 pips). The snapshot's `deck.remaining`
entries don't carry rarity directly; we'd have to look up the card
def.

**Choice.** Compute `max` from the original deck composition:
`max = original[cardId]` (the pre-match copy count for that cardId).
Legendaries always start at 1; all others start at 2. If
`original[cardId]` is undefined (a generated/stolen card that was
shuffled in mid-match), default `max = remaining`.

**Rationale.** This avoids a card-def lookup per row. The original
deck composition is already in the snapshot and is the *practical*
max. The fallback handles edge cases like Sir Finley's tutor effect
without requiring rarity metadata.

### D4 — Drawn-to-zero rendering

**Context.** When `remaining === 0`, the desktop variant slides the
row out and removes it. The compact variant should keep the row
visible so the user sees "this card existed, all copies are gone."

**Choice.** Render the row with `opacity-40`, no rarity tint
(falls back to `text-text-mute`), and all pips hollow. No animation
beyond a 200 ms `transition-opacity`.

**Rationale.** Disappearing rows force the eye to track which cards
are gone by absence. Persisting them with a clear "spent" treatment
turns "what's left" into "fill in what's missing" — better legibility
during play.

### D5 — File layout and imports

`CardPips.tsx` lives next to `LiveDeckPanel.tsx`. It is a tiny pure
component (~30 LOC) and exports one default `CardPips` plus the
`CardPipsProps` type for testing. It has no store dependencies.

## Risks / Trade-offs

- **Risk:** `deck.remaining` shape varies enough between snapshots
  that re-sorting on every tick causes layout jitter.
  → **Mitigation:** the sort comparator is deterministic on
  (cost, name, cardId). Same input → same order. The animation budget
  is opacity-only, so even reorders would not visually thrash.

- **Risk:** A card with `original = 1` and `remaining = 2`
  (e.g. duplicated by a Battlecry) renders 2 pips in 1-pip space.
  → **Mitigation:** D3's fallback uses `max = remaining` when
  `remaining > original`. Pip count is `max(original, remaining)` so
  shuffled-in copies render legibly.

- **Trade-off:** No exit animation in the compact variant means
  the user loses the "card just got drawn" cue. In practice, the
  pip-fill transition is its own cue; we trust the user's eyes more
  in the overlay than in the focused tracker.

- **Trade-off:** Carrying both render branches in one file grows
  `LiveDeckPanel` by ~40 lines. We accept this over a separate
  component to keep the snapshot subscription single-sourced.
