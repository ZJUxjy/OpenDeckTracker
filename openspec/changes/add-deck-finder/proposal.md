## Why

The OpenDeckTracker UI v2 design (Direction A locked) places a
"Decks → Deck Finder" surface in the artboard's tab strip — a popular
decks browser the user can search and import from. See
`docs/design/opendecktracker/project/v2-deck-finder.jsx`
(`ConsoleDeckFinder`) and `docs/design/opendecktracker/chats/chat1.md`
("Decks tab added with a finder — class chips, archetype, 'includes/
excludes card', max-dust slider, sort, and a detail pane with curve +
key cards + import button").

Today the `/decks` route is the user's saved-deck management page
(`DecksPage.tsx` from `add-deck-management`) — there is no way to
browse a curated list of popular decks, see their winrates / dust
costs / mana curves, and one-click import them into the saved-decks
store. This change closes that gap by introducing a Deck Finder
surface alongside the existing Saved tab.

The data source for v1 is a vendored seed file. A live HSReplay /
firestone-style remote feed is a reasonable follow-up but not needed
to ship the design — the finder's filtering, sorting, and import
plumbing all work against any list shape, so swapping the data source
is a localized future change.

## What Changes

- **NEW** `popular-decks-seed.ts` in `@hdt/core` (or a sibling of
  `packages/core/src/deck/`): a hand-curated list of popular-deck
  entries spanning classes, formats, and archetypes (~12-16 entries
  for v1). Each entry: `{ id, name, class, format, archetype,
  deckstring, winratePercent, gamesCount, dustCost, author,
  updatedAt }`. The seed list parses through the existing
  `decodeDeck` / `validateDeck` to compute mana curve and key-cards
  on demand; it does NOT bake those into the seed file.
- **NEW** `PopularDeck` and `PopularDeckArchetype` types in
  `@hdt/core/deck`: `PopularDeckArchetype = 'Aggro' | 'Midrange' |
  'Control' | 'Combo' | 'Tempo' | 'Ramp'`.
- **NEW** Pure-TS `filterPopularDecks(list, criteria)` and
  `sortPopularDecks(list, sort)` in `@hdt/core/deck/popular-deck-search`,
  fully unit-testable.
- **NEW** `popular-decks:list` IPC channel and
  `window.hdt.popularDecks.list()` preload binding that returns the
  seed list. This wraps the seed so the renderer never imports
  `@hdt/core` data at runtime.
- **MODIFIED** `apps/desktop/src/renderer/src/components/DecksPage.tsx`
  becomes a Radix Tabs container with two tabs: "Saved" (the
  existing saved-decks UI moved into a sibling `SavedDecksTab.tsx`)
  and "Finder" (new `DeckFinderTab.tsx`). The default active tab is
  "Saved" so the existing user flow is preserved on a fresh visit.
- **NEW** `DeckFinderTab.tsx`: header + filter rows + body split
  matching the design's `ConsoleDeckFinder`:
  - Header chip: "X of Y decks · indexed N" (N from
    `popular-decks-seed`).
  - Includes-card / excludes-card text inputs (case-insensitive
    substring match against card *names*, resolved through
    `window.hdt.cards.findById`).
  - Format pills: STD / WLD / CLS / TWS (one default selected on
    mount; chosen pill scopes the list).
  - Class chips row with ALL CLASSES + per-class chips using the
    existing class iconography from
    `apps/desktop/src/renderer/src/components/Decklist.tsx`.
  - Archetype filter row: All / Aggro / Midrange / Control / Combo /
    Tempo / Ramp.
  - Subfilter row: Max-dust slider (1000-20000) + Sort
    (Popular / Winrate / Updated / Cheapest).
  - Body: results list (`1.4fr`) + detail pane (`1fr`).
- **NEW** `PopularDeckRow.tsx`: a list row matching the design (class
  crest + name + archetype/by author/upd time + winrate% + games).
- **NEW** `PopularDeckDetail.tsx`: the detail pane with class header,
  KPI strip (WINRATE / GAMES / DUST), `ManaCurveChart` mini SVG,
  Key Cards list (mana gem + name + pip-count for copy count), and
  the IMPORT TO MY DECKS / COPY CODE buttons.
- **NEW** `ManaCurveChart.tsx`: a small inline SVG bar chart over a
  `[0, 1, 2, 3, 4, 5, 6, 7+]` cost-bucket array, derived from the
  decoded deckstring on demand.
- **NEW** "IMPORT TO MY DECKS" button: invokes
  `window.hdt.decks.importDeckstring(deckstring)`, then switches the
  Decks page tab to "Saved" and opens the editor on the new deck.
- **NEW** "COPY CODE" button: `navigator.clipboard.writeText(deckstring)`
  with a transient "Copied" pill on the button for ~1.5 s.
- **NEW** i18n keys under `decks.finder.*` in `en-US.json` and
  `zh-CN.json`: title, header chip, filter labels, archetype labels,
  sort labels, KPI labels, button labels, empty state text.
- **NON-GOALS for v1 (deferred to follow-up changes):**
  - Live remote feed (HSReplay-style). The seed file is the only
    source.
  - Real card art in the detail pane's Key Cards list. v1 uses the
    existing `CardImagePopover` (hover-only) or just the card name +
    mana gem.
  - Author profiles / linking.
  - Real "indexed N" telemetry — N is `seed.length` for v1.
  - Per-deck difficulty / playstyle metadata beyond the archetype tag.
  - Twist-format gameplay validation — Twist is included in the
    format pill set because `@hdt/core` already supports it, but the
    seed list itself may not include any Twist entries on day one.
  - The design's custom class names (Ember/Tide/Bramble/etc.) — we
    use real Hearthstone class names.

## Capabilities

### New Capabilities

- `deck-finder`: Pure domain rules for the popular-decks seed list,
  the filter/sort criteria contract, and the seed-file maintenance
  boundary.
- `deck-finder-ipc`: Main↔renderer IPC contract for
  `window.hdt.popularDecks.*`, mirroring the existing card / decks /
  match-history IPC patterns.
- `deck-finder-ui`: Renderer behavior for the Decks-page tab
  container, the Finder tab's filter / sort / list / detail
  composition, the IMPORT and COPY CODE actions, and the Mana Curve
  + Key Cards rendering.

### Modified Capabilities

None. `deck-management-ui`'s saved-decks list semantics are unchanged
— only the page-level container that hosts it picks up a sibling tab.

## Impact

- `packages/core/src/deck/` — new `popular-decks-seed.ts` (data),
  `popular-deck-search.ts` (filter / sort), and types in
  `deck-types.ts`.
- `apps/desktop/src/main/popular-decks-ipc.ts` (new) — registers
  `popular-decks:list`. Bootstrap call wires it from
  `apps/desktop/src/main/ipc.ts`.
- `apps/desktop/src/preload/index.ts` — add `popularDecks.list()`
  binding.
- `apps/desktop/src/renderer/src/components/DecksPage.tsx` — wraps
  the existing content in a tab container. The bulk of the existing
  page moves into a new `SavedDecksTab.tsx` so `DecksPage` stays
  thin.
- `apps/desktop/src/renderer/src/components/DeckFinderTab.tsx` (new)
  + `PopularDeckRow.tsx` + `PopularDeckDetail.tsx` +
  `ManaCurveChart.tsx`.
- `resources/locales/{en-US,zh-CN}.json` — new `decks.finder.*`
  block.
- No DB / IPC schema migrations. No external dependency changes.
- The existing `tests/theme-tokens-grep.test.ts` regression must
  continue to pass; new components consume the existing token
  utilities (`bg-bg`, `bg-bg-2`, `text-text`, `text-accent`,
  `border-border`, etc.) — no raw color literals.
