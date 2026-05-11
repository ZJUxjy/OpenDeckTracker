## Why

Our current Collection route is a 2-column list of expansion summary
rows. A player can see "Core 580/680" but cannot drill into a set to
inspect *which* specific cards they are missing — a basic affordance
that every Hearthstone collection tracker (Blizzard's own client, NGA's
战旗, HSReplay) provides.

The reference Figma at
`https://www.figma.com/design/cnHwyUjYfg9OXeu1vQXtAt` was produced
against the NGA tracker layout but re-skinned to our existing
Liquid-Glass tokens. It defines two views:

1. **Set Grid** — a 5-column grid of set tiles with dual-stat
   (`唯一卡牌` + `总收藏数`) info area, completion badge, and tab bar
   for the four other collection categories we do not yet support
   (`卡背 / 英雄 / 幸运币 / 卡牌包`).
2. **Set Detail** — a drilldown reached by clicking a tile, showing the
   full card list of one set with rarity / class / type / mana / search
   filters, owned-count badges, and dust values for unowned cards.

Both views work entirely off data we already expose
(`collection.getProgress()`, `cards.search({ set })`,
`cardImages.get(cardId)`); no new IPC contract is required.

## What Changes

- Add a new `collection-progress-ui` capability covering the Set Grid
  redesign and Set Detail drilldown as a single navigable surface.
- Replace the 2-column tile list in `Collection.tsx` with a 5-column
  set-tile grid. Each tile shows `ownedUniqueCards / totalCards`
  ("唯一卡牌") AND `ownedCopies / totalCopies` ("总收藏数"), a thin
  progress bar driven by unique-card completion, and a Complete badge
  when `ownedCopies === totalCopies`.
- Add a 5-tab bar (`卡牌 / 卡背图案 / 英雄 / 幸运币 / 卡牌包`). Only
  `卡牌` is active; the other four render with a `未开放` chip and are
  non-interactive.
- Add a format + search filter row to the Set Grid view.
- Add a Set Detail subroute reached by clicking a tile. The detail page
  shows the set logo + name + total progress in its header, a filter
  row (rarity / class / type / mana 1–7+ pills / search), and a
  5-column card cell grid.
- Each card cell renders the cached card image (via
  `cardImages.get`), an "x{owned}/{max}" badge whose color reflects
  ownership state (green=full / amber=partial / red=zero), and a dust
  value chip derived from rarity.
- Cards the player does not own render with a dim overlay and a "未拥有"
  pill so the visual distinction is unmistakable.

## Non-goals

- Do not implement the four disabled tabs (cardback / hero / coin /
  pack). They render as visual placeholders until HearthMirror surfaces
  those categories.
- Do not introduce URL-based routing or a router dependency. Detail
  navigation lives in component state inside `CollectionPage`.
- Do not change `collection-progress` IPC shapes or `cards.search`
  capabilities — both already expose what the UI needs.
- Do not implement disenchant / craft actions; dust values are
  display-only.
- Do not redesign the overall progress card or the cached/empty
  banners; those keep their current behavior.

## Capabilities

### New Capabilities

- `collection-progress-ui`: The Collection route as a navigable two-view
  surface (Set Grid + Set Detail), 5-column tile layout, category tab
  bar, filter affordances, card cell with ownership states, and the
  rarity→dust derivation used by the detail view.

## Impact

- Renderer:
  - `apps/desktop/src/renderer/src/components/Collection.tsx` —
    becomes a thin container that switches between the two views;
    grid-rendering logic moves into `CollectionSetGrid.tsx`.
  - `apps/desktop/src/renderer/src/components/CollectionSetGrid.tsx` —
    new (set tile grid + tabs + filters).
  - `apps/desktop/src/renderer/src/components/CollectionSetDetail.tsx`
    — new (set drilldown).
  - `apps/desktop/src/renderer/src/components/SetTile.tsx` — new
    (extracted tile component reused by the grid).
  - `apps/desktop/src/renderer/src/components/CollectionCardCell.tsx`
    — new (card cell used by the detail grid).
- Core:
  - `packages/core/src/collection/dust.ts` — new (`dustValueForRarity`,
    `maxCopiesForRarity`).
- i18n:
  - `resources/locales/en-US.json` / `zh-CN.json` — new keys for tabs,
    filter labels, owned-count formats, and the unowned pill.
- Tests:
  - `apps/desktop/src/renderer/tests/Collection.progress.test.tsx`
    extends to cover the new tile layout and tab disabled state.
  - `apps/desktop/src/renderer/tests/CollectionSetDetail.test.tsx` —
    new (header, filters, owned-state rendering).
  - `apps/desktop/src/renderer/tests/SetTile.test.tsx` — new (tile
    states: complete / selected / partial / empty).
  - `packages/core/src/collection/dust.test.ts` — new (rarity
    lookup table).
- Figma reference (read-only):
  `https://www.figma.com/design/cnHwyUjYfg9OXeu1vQXtAt` — Set Grid
  frame `2:2`, Set Detail frame `2:220`.
