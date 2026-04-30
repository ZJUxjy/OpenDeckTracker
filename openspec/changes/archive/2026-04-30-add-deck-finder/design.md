## Context

The OpenDeckTracker UI v2 design (Direction A locked) introduces a
"Deck Finder" surface for browsing and one-click importing popular
decks. See `docs/design/opendecktracker/project/v2-deck-finder.jsx` →
`ConsoleDeckFinder` for the canonical layout, and
`docs/design/opendecktracker/chats/chat1.md` for the user's intent
("Popular decks for each class will be pre-stored in the database,
and users can search through them using this tool, with filters like
class, whether a specific card is included, and so on").

Current state: the `/decks` route is the saved-decks management page
shipped by `add-deck-management`. The renderer has no popular-deck
data source, no IPC for it, and no Finder UI. The existing
`@hdt/hearthdb` deckstring decoder is reusable as-is to extract mana
curve and key-card data from a deckstring.

## Goals / Non-Goals

**Goals:**
- A first-class Deck Finder surface inside the Decks page, switchable
  via a tab strip.
- A vendored, deckstring-anchored seed list of popular decks. The
  seed is the single source of truth for v1; the renderer never
  hard-codes deck data.
- Filter / sort logic isolated from the UI as pure functions, fully
  unit-testable.
- One-click "Import to My Decks" → switches to Saved tab → opens
  editor on new deck. Reuses existing `decks.importDeckstring` IPC.
- Layout pixel-targeting the design's `ConsoleDeckFinder` proportions
  (1.4fr / 1fr split, header chip, filter rows, KPI strip, mana
  curve, key cards).

**Non-Goals:**
- Live remote feed. The seed list is local; updating it requires a
  code change (acceptable v1 cost).
- Real card art for Key Cards. We reuse the existing
  `CardImagePopover` hover treatment or render a minimal class-crest
  tile.
- Per-class custom theming on the Finder (the design uses
  per-class `oklch(...)` hue chips, but our existing class iconography
  in `Decklist.tsx` is the consistent renderer-side baseline; the
  Finder reuses it rather than introducing a parallel class-color
  table).
- Designer-original class names (Ember / Tide / Bramble / etc.). v1
  uses real Hearthstone class names.
- Multi-format browsing of a single deck (a deck is either Standard
  or Wild or Classic or Twist; no cross-format).

## Decisions

### 1. Vendored seed file vs. remote feed

**Context:** Popular-deck data needs to come from somewhere. The
design assumes "pre-stored in the database" but the user has not
specified an external source.

**Options:**
- A. Vendored seed file in `@hdt/core/deck/popular-decks-seed.ts`.
- B. Local SQLite table populated at first launch from a bundled
  fixture.
- C. Remote feed (HSReplay-style API).

**Choice:** A.

**Rationale:** v1 needs ~12-16 entries to make the design feel
populated; that's a TS file, not a database. A SQLite table buys
nothing because the data is read-only and small. A remote feed is a
worthy follow-up but blocks v1 on a third-party API choice we
shouldn't make in this change. The seed file's shape is forward
compatible with both B and C.

### 2. Tabs inside `/decks` vs. new sidebar entry

**Context:** Where does the Finder live in app navigation?

**Options:**
- A. New sidebar entry "Finder" → `/finder`.
- B. Tabs inside the existing Decks page (Saved / Finder).
- C. New nested route `/decks/finder` with no in-page tabs.

**Choice:** B.

**Rationale:** The v2 artboard (`v2-artboard.jsx`) treats "Decks" as
a single tab containing the Finder; the user landed on this design
deliberately. Adding a separate sidebar entry would create surface
duplication ("Decks" + "Finder" both being deck-related). Nested
routing with no in-page tab UI hides the Finder behind a URL the
user has to know. Tabs inside `/decks` keep one sidebar entry,
match the design intent, and let users flip between their saved
decks and the popular-deck browser without leaving the page.

### 3. Computing mana curve / key cards on demand vs. baking into seed

**Context:** The detail pane shows a mana curve (8 buckets) and a
key-cards list. Both are derivable from a decoded deckstring.

**Options:**
- A. Bake `manaCurve: number[]` and `keyCards: string[]` into the
  seed.
- B. Decode the deckstring on demand inside the renderer (or in core
  via a helper).
- C. Decode at IPC time in the main process and stuff it into the
  payload.

**Choice:** B (decode in core via `decodeDeck`, exposed as a small
`computeManaCurve(deckstring)` / `computeKeyCards(deckstring)` pair
in `popular-deck-derived.ts`).

**Rationale:** Baking duplicates information that may drift if the
deckstring is updated. Decoding inside the renderer would import
`@hdt/hearthdb` into the renderer bundle (it's already imported via
existing flows, but the principle is to keep decoding in core).
Decoding at IPC time inflates the payload for data the user may
never see (only the *selected* deck's curve renders). Computing
client-side, lazily on selection, matches the design (the detail
pane only renders for `sel`).

### 4. IPC channel design — `popular-decks:list` returns the whole seed

**Context:** The renderer needs the full seed list to filter / sort
client-side. Possible API shapes:

**Options:**
- A. `popular-decks:list()` returns the whole array (no
  server-side filtering).
- B. `popular-decks:search(criteria)` returns filtered results.

**Choice:** A.

**Rationale:** Server-side filtering only matters when the dataset is
large. ~16 entries is trivially small and the UI's filter feedback
is meant to be live (no IPC round-trip per keystroke). The
`window.hdt.popularDecks.list` shape stays valid if v2 swaps in a
remote feed; the renderer only loses live filtering of remote
results, which a v2 change can re-introduce.

### 5. `Includes card` / `Excludes card` semantics

**Context:** The design's `includesCard` and `excludesCard` text
inputs match the `cards` field of each deck (a string array of card
names in the design). In our implementation, we have `deckstring`
and need to surface card *names* for filtering.

**Options:**
- A. Bake a `cards: string[]` field into each seed entry.
- B. Decode the deckstring on demand, look up names via
  `window.hdt.cards.findByDbfId`.
- C. Cache a name-resolved card list in the store after the first
  lookup.

**Choice:** C, as a Map keyed by deck id, lazily populated when the
filter input first acquires a non-empty value. Decoding for all
~16 decks once is cheap; resolving names is one batched
`cards.findByDbfId` call per unique dbfId. The cache is an in-memory
`Map<deckId, string[]>` in the Finder component (or a Zustand
slice) — never persisted.

**Rationale:** A duplicates the deckstring data and goes stale if a
seed entry is ever edited. B re-decodes per keystroke (cheap but
wasteful). C is the right tradeoff: pay the decode cost once, then
filter is a pure substring scan.

### 6. ManaCurveChart — inline SVG, not Recharts

**Context:** The design's curve is a tiny 8-bar histogram, ~300×48
px.

**Options:**
- A. Reuse Recharts (already a renderer dependency for Stats).
- B. Inline SVG.

**Choice:** B.

**Rationale:** Recharts is overkill for 8 bars and adds an axis /
tooltip / legend layer the design explicitly does not have. Inline
SVG keeps the component ~30 lines and renders identically to the
mock.

### 7. Class iconography — reuse existing renderer pattern

**Context:** The design uses `<window.ClassCrest cls="ember"
size={28} />` with `oklch(...)` per-class hues. Our existing
`Decklist.tsx` already renders class icons for the saved-decks list.

**Choice:** Reuse the existing class icon component / pattern from
`Decklist.tsx`. The design's specific oklch palette is treated as
inspiration for the chip background (a soft `var(--accent-dim)` for
the active chip is sufficient).

**Rationale:** Introducing a parallel `ClassCrest` component with a
fresh per-class hue table forks visual identity. Tracking down a
single canonical class-icon contract lets the existing tracker UI
and Finder share one source.

## Risks / Trade-offs

- **Risk:** Seed list rots — Hearthstone meta shifts every patch and
  the seed becomes stale.
  **Mitigation:** v1 ships with 12-16 well-known archetypal decks
  that describe a *shape* (Aggro Mage, Control Warrior) more than a
  current ladder snapshot. Updating the file is a simple PR. A v2
  follow-up can swap in a live feed.
- **Risk:** Renderer-side decode latency for `Includes card` filter
  on first keystroke (16 deckstrings × ~30 cards each = ~480 dbfId
  lookups).
  **Mitigation:** the cache is keyed per deck id and populated lazily
  on first filter use. Card lookups go through the in-memory CardDb
  (already bootstrapped) — sub-millisecond. The Finder shows a small
  "indexing…" hint while resolving on slow first paint.
- **Risk:** Tab UX confusion — users currently expect `/decks` to
  show their saved decks immediately.
  **Mitigation:** Default tab is "Saved". The "Finder" tab is a
  one-click destination clearly labeled. URL hash optionally carries
  `?tab=finder` for deep links (nice-to-have, not required for v1).
- **Trade-off:** Single sidebar entry "Decks" hosts two distinct
  surfaces. Acceptable because the design itself collapses them, and
  the alternative (parallel sidebar entries) clutters the nav.

## Migration Plan

Renderer + core only; no DB / IPC schema migration. The new
`popular-decks:list` IPC is additive. `window.hdt.popularDecks` is a
new namespace and does not touch existing typings beyond extending
the preload `api` literal.

The current `DecksPage.tsx` (~120 lines today) is split into a thin
`DecksPage` (tab container) + `SavedDecksTab` (the existing content
hoisted unchanged). Tests for the saved-decks list remain green
because the inner component is unchanged; only the route-level
container test needs to assert "tab strip exists, Saved is default".

## Open Questions

None blocking. Two minor questions resolved in advance:

- *Should COPY CODE include format metadata?* No — `decks.exportDeckstring`
  output is the canonical Hearthstone deckstring, identical to what
  the in-game "Copy Deck" button produces.
- *Should the Finder render even when CardDb hasn't loaded?* Yes,
  but the `Includes/Excludes card` inputs are disabled with a
  "indexing cards…" hint until `window.hdt.cards.findByDbfId` is
  available. Filtering by class / archetype / dust / sort is fully
  available without CardDb.
