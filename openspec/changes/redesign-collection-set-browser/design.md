## Context

The Collection route today renders a single 2-column list of set
summary rows. Backing data — `SetProgress` rows from
`collection:get-progress` and `CollectionCard[]` from the snapshot
store — is already complete enough to power a per-set drilldown, and
`cards.search({ set })` already filters the card database by set code.
The gap is purely renderer-side: there is no navigation off the grid
into a per-set view, no tab affordance for the other Hearthstone
collection categories, and no visual treatment for "not owned" cards.

This change adds the renderer-side affordances captured in the Figma
reference, while preserving every existing requirement under the
`collection-progress` capability (the data layer is unchanged).

Expected file structure after implementation:

```text
apps/desktop/src/renderer/src/
  components/
    Collection.tsx                # thin container, route state
    CollectionSetGrid.tsx         # NEW — grid view
    CollectionSetDetail.tsx       # NEW — drilldown view
    SetTile.tsx                   # NEW — extracted tile
    CollectionCardCell.tsx        # NEW — card cell
  tests/
    Collection.progress.test.tsx
    CollectionSetDetail.test.tsx  # NEW
    SetTile.test.tsx              # NEW
packages/core/src/collection/
  dust.ts                         # NEW — rarity lookup
  dust.test.ts                    # NEW
resources/locales/
  en-US.json
  zh-CN.json
```

## Goals / Non-Goals

**Goals:**

- Replace the 2-column list with a 5-column set-tile grid using
  existing Liquid Glass tokens.
- Make every tile clickable, opening a drilldown that lists the cards
  in that set with their ownership state.
- Match the Figma structure (tab bar / dual-stat tile / 5-col card
  grid / dust chip / dim-overlay for unowned) while using our tokens
  (`--accent`, `--semantic-*`, `tahoe-card`, `--class-*`).
- Keep the four non-card tabs visible but disabled so the layout is
  in place when the underlying HearthMirror channel is added.
- Derive max-copies and dust values from card rarity in a single
  shared `@hdt/core` utility.

**Non-Goals:**

- No new IPC shapes; the renderer uses `collection.getProgress()`,
  `cards.search({ set })`, and `cardImages.get(cardId)` as they exist
  today.
- No URL-based routing or router dependency.
- No disenchant / craft actions.
- No live-data plumbing for the four disabled tabs.

## Decisions

### Decision 1: Routing strategy for the drilldown

**Options:**

- Add a router (e.g. `react-router`) and a `/collection/sets/:setCode`
  route.
- Track the active set code in component state inside
  `Collection.tsx`.

**Choice:** State-only. `Collection.tsx` holds
`selectedSetCode: string | null`; the component renders
`CollectionSetGrid` when null and `CollectionSetDetail` when set.

**Rationale:** The app does not currently use a client router; adding
one for a single drilldown is disproportionate. The grid/detail toggle
is a local navigation concern with no need for deep linking or browser
history.

### Decision 2: Where the new tile structure lives

**Options:**

- Inline the tile JSX in `Collection.tsx` like today.
- Extract a `SetTile.tsx` component reused by both views.

**Choice:** Extract `SetTile.tsx`. The grid view renders it as the
clickable cell, and the detail header reuses its "art bar" treatment
(the colored block with set name) as a logo thumbnail.

**Rationale:** The tile gains structure (art header, dual-stat info,
progress bar, selected/complete states) — keeping that inline in
`Collection.tsx` quickly becomes unreadable, and tests want to assert
states (complete / partial / empty) without rendering the full page.

### Decision 3: Card ownership lookup in the detail view

**Options:**

- Add a new IPC handler that returns "owned counts per card_id within
  set X".
- Compose the existing data in the renderer: fetch
  `cards.search({ set })` for the card list and re-use the in-flight
  `collection.getProgress()` snapshot for owned dbf-id counts.

**Choice:** Compose in the renderer. The detail view fetches
`cards.search({ set, collectible: true })` once on mount, builds an
owned-count `Map<dbfId, count>` from the most recent
`CollectionProgressResponse` (already cached by `Collection.tsx`), and
combines them at render time.

**Rationale:** Avoids a new IPC contract and keeps the data layer
unchanged. The renderer already needs the cards array to render images
and filter chips; adding a parallel IPC for the join is redundant.

### Decision 4: Card image loading

**Options:**

- Pre-fetch every card image when the detail page mounts.
- Lazy-load via `loading="lazy"` on `<img>` tags.

**Choice:** Lazy-load via the native `loading="lazy"` attribute, with
`cardImages.get(cardId)` called per cell on mount (the cache returns
synchronously on cache hit).

**Rationale:** Per the project memory, all card images must route
through `card-image-cache`. The cache fronts the CDN, so first-time
fetches still warm the cache once per card; subsequent visits are
disk-served. The native `loading="lazy"` defers off-screen image
requests until the user scrolls, which keeps initial detail-page
render snappy for sets with 100+ cards.

### Decision 5: Dust derivation lives in `@hdt/core`

The rarity → dust mapping is a pure fact about Hearthstone economics
that other surfaces (deck builder, Stats page) will eventually want.
Put it in `packages/core/src/collection/dust.ts` so it can be unit
tested without renderer scaffolding and re-used elsewhere.

```ts
export function dustValueForRarity(rarity: Rarity): number
export function maxCopiesForRarity(rarity: Rarity): number
```

### Decision 6: Tab placeholders rather than feature flags

The four non-card tabs render as visually styled but non-interactive
labels with a small `未开放` chip beside them. We do NOT add a feature
flag or route; the tabs are pure layout placeholders. When a tab gains
real data, its requirement will move into its own capability.

### Decision 7: Filter state scope

Filter chips (rarity, class, type, mana, search) hold local React
state inside `CollectionSetDetail`. They reset whenever the user opens
a different set (i.e. when `selectedSetCode` changes). They are not
persisted across navigation — a deliberate choice to avoid surprising
"sticky filter" behavior when the user comes back to the grid and
opens a different set.

## Risks / Trade-offs

- **Risk:** Lazy image loading combined with rapid filter changes
  could cause a flash of unloaded thumbnails as the cache fills.
  **Mitigation:** Use the tile thumbnail (`cardImages.getTile`) as a
  cheap placeholder while the full render loads.
- **Trade-off:** State-only routing means the user cannot deep-link to
  a specific set drilldown. Acceptable: this is a desktop tool with
  no external link sharing surface.
- **Trade-off:** Disabled tabs occupy layout space without providing
  function. Acceptable: they signal upcoming work and prevent layout
  reflow when those tabs ship.

## Migration Plan

Additive only. The existing requirement
"Collection page renders real per-set progress" in
`collection-progress` remains satisfied: every `SetProgress` row still
becomes one tile, the Standard/Wild toggle still drives which array
feeds the grid, and the mirror/cache/empty banner still renders above
the grid. The new capability adds visual structure (tile layout, tab
bar, drilldown) on top of that contract.

No data migration. No IPC contract change. No persistence change.
