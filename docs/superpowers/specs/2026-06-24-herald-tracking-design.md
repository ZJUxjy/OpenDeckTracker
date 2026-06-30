# Herald / 兆示 Tracking Design

## Context

The latest local hsdata dump (`35.6.2.245096`) introduces the Cataclysm keyword
`HERALD`, localized as `兆示`. Card text uses `Herald {0}` / `兆示{0}`.
The raw XML gives us a better source of truth than string matching:

- Cards that perform the keyword carry `<Tag name="HERALD" ... />`.
- Cards improved by the keyword carry `<ReferencedTag name="HERALD" ... />`.

An external Cataclysm preview describes Herald as a new keyword used by
Deathwing-aligned classes, where repeated Herald usage strengthens those allies:
https://www.windowscentral.com/gaming/hearthstones-own-take-on-the-cataclysm-is-the-ultimate-reset

Current code already has a good home for this feature:

- `MatchExtraDisplayState` owns per-match counters and pools.
- `LiveDeckPanel` renders extra-display hover lines from snapshot counters.
- `OverlayView` reuses `LiveDeckPanel`, so player overlay can receive the same
  row behavior.
- Overlay users also need a visible-at-a-glance summary, because hover is easy to
  miss in the in-game overlay.

## Goal

Track how many times the local player has Heralded this game and show that count
on every Herald-related card. The player overlay must also surface the count in a
compact header chip so it is visible without hovering.

## Scope

In scope:

- Convert hsdata `HERALD` and `ReferencedTag HERALD` into generated card JSON.
- Add `heraldCountThisGame` as a shared extra-display counter.
- Count local-player Herald triggers from the Power.log-driven tracker flow.
- Show `本局已兆示：N 次` on Herald casters and Herald payoff cards.
- Show a compact overlay/header chip, `兆示 N`, when the current deck, hand, or
  board contains Herald-related cards, or once the count is greater than zero.
- Add focused tests for converter, core state, PowerEvent wiring, LiveDeckPanel,
  and OverlayView.

Out of scope:

- Opponent Herald counting. Opponent card hidden information makes exact tracking
  unreliable, and the current request is about the player's Herald cards.
- Predicting the hidden target represented by `{0}`.
- Simulating Deathwing/lieutenant upgrades beyond displaying the shared Herald
  count. Individual card text can use the same counter later.

## Card Metadata

The converter should preserve two concepts:

- `mechanics: ["HERALD"]` for cards with an actual `Tag HERALD`.
- `referencedTags: ["HERALD"]` for cards with `ReferencedTag HERALD`.

This keeps the UI data-driven. Current Herald-related collectible cards are:

- Herald casters: `CATA_156`, `CATA_158`, `CATA_160`, `CATA_492`, `CATA_497`,
  `CATA_525`, `CATA_530`, `CATA_561`, `CATA_565`, `CATA_580`, `CATA_722`,
  `CATA_725`, `CATA_780`, `CATA_785`.
- Herald payoffs/references: `CATA_150`, `CATA_151`, `CATA_153`, `CATA_154`,
  `CATA_155`, `CATA_190h`, `CATA_726`.

## Trigger Semantics

Not every Herald card should increment on ordinary card play:

- Spells, Battlecry minions, and Battlecry weapons Herald during their `PLAY`
  block.
- `CATA_158` Heralds from `Deathrattle`, so it must increment on a later
  `TRIGGER` block, not when the minion is played.
- `CATA_492` is a Location. Its text is the activated location power, so it must
  increment on a `POWER` block, not when the location is played.

The tracker should classify this from metadata and text:

- `mechanics` contains `HERALD` is the broad "this card can Herald" signal.
- Plain text containing `Deathrattle:` before `Herald` means `trigger`.
- `type === "LOCATION"` and `mechanics` contains `HERALD` means `power`.
- Other `HERALD` cards count on `play`.

The main `CardPlayedDetector` should remain focused on `PLAY`. A small Herald
trigger detector should observe non-PLAY `block-start` events (`TRIGGER`,
`POWER`) and forward the entity id to `DeckTracker.recordHeraldTriggered`.
`DeckTracker` resolves ownership and card metadata, then `MatchExtraDisplayState`
increments only when the card's Herald timing matches that block type.

## Snapshot Shape

The existing `DeckTrackerSnapshot.extraDisplay.counters` object gets a new key:

```ts
{
  heraldCountThisGame: number;
}
```

The key should be absent or `0` before the first Herald. UI code must treat
missing as zero.

## UI And Overlay

Row hover:

- If a card has `mechanics` containing `HERALD` or `referencedTags` containing
  `HERALD`, its hover preview includes `本局已兆示：N 次`.
- This is data-driven and does not require entries in
  `standard-extra-display-candidates/*.json`.
- The existing row highlight behavior can stay restrained: rows may set
  `data-extra-display="active"` for preview behavior, but should only use strong
  ring highlighting when the existing row logic already does so or when the count
  is greater than zero.

Header / player overlay:

- `LiveDeckPanel` should render a compact keyword counter strip under the board
  attack summary.
- The strip shows a `兆示 N` chip when:
  - the current deck/hand/board contains a Herald caster or payoff card, or
  - `heraldCountThisGame > 0`.
- Because `OverlayView` uses `LiveDeckPanel`, this covers the player overlay
  without adding a second overlay-specific implementation.
- The chip number must use `font-mono` / `tabular-nums`, matching existing
  numeric UI rules.

Opponent overlay:

- No opponent Herald chip in this change.
- Opponent overlay may still show Herald-related opponent cards as normal
  revealed cards, but without a count.

## Risks

- Power.log may represent Location activations with a block type different from
  `POWER` on some clients. The first implementation should isolate the detector
  so adding another block type is a one-line test-backed change.
- Dual GameState / PowerTaskList streams can duplicate block-start events. The
  Herald trigger detector must suppress same-entity same-block re-fires within a
  short window, matching the existing `CardPlayedDetector` strategy.
- Future hsdata may introduce Herald cards whose trigger timing cannot be
  inferred by current text heuristics. The helper should keep timing logic in one
  file and have tests that make new cases obvious.

## Verification

- `pnpm exec vitest run scripts/convert-hsdata-cards.test.ts`
- `pnpm --filter @hdt/core test extra-display-state herald`
- `pnpm --filter @hdt/core test deck-tracker`
- `pnpm --filter @hdt/desktop test LiveDeckPanel OverlayView`
- `pnpm cards:convert`
- `pnpm typecheck`

