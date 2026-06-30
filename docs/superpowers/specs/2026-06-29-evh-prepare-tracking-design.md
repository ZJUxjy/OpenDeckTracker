# Prepare / 预备 & EVH Promo Tracking Design

## Context

The local hsdata dump (`35.6.2.245096`) already includes early *Escape from
Violet Hold* (逃离紫罗兰监狱) cards ahead of the July 8, 2026 launch. The
expansion introduces several rule-breaking mechanics; only a subset is present in
the current client data:

| Mechanic | Local XML status |
|---|---|
| **Prepare / 预备** | `PREPARE` tag on 4 collectible cards |
| **Bribe / 贿赂** | `CATA_EVENT_402` Deadly Bribe (no `BRIBE` tag yet) |
| **Disguise / 伪装** | Not in current dump |
| **Rulebreaker** | Not in current dump |

Official Prepare rules (35.6 announcement):

- Drag a Prepare card from hand onto the deck.
- Spend **all remaining mana** this turn.
- Reduce the card's cost by **spent mana + 1**.
- The card returns to hand at the discounted cost for a future turn.

Raw XML signals:

- Cards that **are** Prepare cards carry `<Tag name="PREPARE" ... />` (e.g.
  `JAIL_407`, `JAIL_906`).
- Cards that only **reference** Prepare in text may carry
  `<ReferencedTag name="PREPARE" ... />` (e.g. `CATA_EVENT_400`,
  `CATA_EVENT_401`).
- Prepare cards also carry `DECK_ACTION_COST` in hsdata; treat as optional
  metadata for UI hints, not as the discount amount (discount is dynamic).

Current code already has homes for this work:

- `MatchExtraDisplayState` — per-match counters and pools.
- `MatchDeckPositionState` — known deck positions (Waveshaping pattern). Prepare
  briefly touches the deck but returns to hand; it must **not** use long-lived
  bottom/top markers the way Waveshaping does.
- `LiveDeckPanel` — extra-display hover lines and Herald-style keyword chips.
- `remaining` algorithm — must not treat the Prepare deck hop as a draw.

Herald / 兆示 tracking (`docs/superpowers/specs/2026-06-24-herald-tracking-design.md`)
is the template for keyword counter + header chip + data-driven row hover.

## Goal

Phase 0–2 (this change):

1. Expose Prepare metadata from hsdata conversion.
2. Track per-hand-entity Prepare discounts and a shared `prepareCountThisGame`
   counter for the local player.
3. Surface Prepare state on currently released EVH promo cards, including hover
   text and a compact `预备 N` header chip.
4. Add card-specific hover hints for the five released collectible EVH cards
   where they depend on shared counters (Vanessa, Moragg, Deadly Bribe).

Future phases (documented, not implemented here):

- Disguise board-side tracking.
- Bribe coin counting beyond Deadly Bribe.
- Rulebreaker rest-of-game flags (deck size 99, double draw, etc.).

## Scope

In scope:

- Convert hsdata `PREPARE` `Tag` / `ReferencedTag` into generated card JSON.
- Add shared counters: `prepareCountThisGame`, `bribeCoinsGivenToOpponentThisGame`.
- Track per-hand-entity Prepare state: base cost, effective cost, discount.
- Increment `prepareCountThisGame` when the local player successfully Prepares.
- Show Prepare discount on hand rows (`预备 -N` or effective cost).
- Show `本局已预备：N 次` on Prepare-related cards (data-driven, like Herald).
- Show compact header chip `预备 N` when deck/hand/board contains Prepare cards
  or `prepareCountThisGame > 0`.
- Card-specific hover for released cards:
  - `JAIL_407` — uses `cardsPlayedThisTurn` context on board.
  - `JAIL_906` — `demonsRemainingInDeck` pool (new deck pool).
  - `CATA_EVENT_402` — combo hint via `cardsPlayedThisTurn`.
- Tests: converter fixture, core state, Prepare detector, LiveDeckPanel chip/hover.

Out of scope:

- Opponent Prepare counting (hidden hand).
- Full Disguise implementation (no card data yet).
- Simulating random outcomes (Vanessa Battlecry minion, Commissary Crook summon,
  Moragg Demon target).
- Changing `remaining` counts during the transient deck hop (must verify no false
  decrement; fix only if logs prove a bug).
- Rulebreaker legendaries not yet in hsdata.

## Card Metadata

Converter preserves:

- `mechanics: ["PREPARE"]` when `<Tag name="PREPARE" />` is present.
- `referencedTags: ["PREPARE"]` when `<ReferencedTag name="PREPARE" />` is
  present.
- Optional `deckActionCost?: number` from `DECK_ACTION_COST` int tag.

Helper module `packages/core/src/tracker/prepare.ts`:

- `PREPARE_COUNTER_KEY = 'prepareCountThisGame'`
- `isPrepareCard(metadata)` — `mechanics` contains `PREPARE` or
  `referencedTags` contains `PREPARE`
- `isPrepareCaster(metadata)` — `mechanics` contains `PREPARE` (card can be
  Prepared from hand)

Released collectible cards (build `245096`):

| cardId | Name | Set | Prepare role |
|---|---|---|---|
| `JAIL_407` | Vanessa the Ringleader / 大头目梵妮莎 | SET_1988 | Caster |
| `JAIL_906` | Moragg / 摩拉格 | SET_1988 | Caster |
| `CATA_EVENT_400` | Commissary Crook / 店铺奸商 | SET_1941 | Referenced + caster |
| `CATA_EVENT_401` | Tunneling Geomancer / 坑道地卜师 | SET_1941 | Referenced + caster |
| `CATA_EVENT_402` | Deadly Bribe / 致命贿赂 | SET_1941 | Bribe (not Prepare) |

## Prepare Detection Semantics

Prepare is **not** a `PLAY` block. It is a deck interaction while the card is in
`ZONE=HAND`.

Expected Power.log shape (to be confirmed against a live 35.6 client; tests use
fixture events):

1. Local-player hand entity with a Prepare-capable `cardId`.
2. `TAG_CHANGE` `ZONE` from `HAND` → `DECK` (or deck-top placement) for that
   entity.
3. `TAG_CHANGE` on `RESOURCES` / mana spent (or infer from `NUM_RESOURCES_USED`
   delta).
4. `TAG_CHANGE` `COST` on the same entity decreases by `spentMana + 1`.
5. `TAG_CHANGE` `ZONE` from `DECK` → `HAND`.
6. Optional `BLOCK_START` / `BLOCK_END` wrapping the sequence.

Implementation:

- New `PrepareActionDetector` in `packages/core`, wired from
  `apps/desktop/src/main/deck-tracker.ts` on the PowerEvent stream (same layer
  as `HeraldTriggerDetector`).
- Detector forwards `{ entityId, cardId, controllerId, discount, turn }` to
  `DeckTracker.recordPrepareAction`.
- `MatchExtraDisplayState` increments `prepareCountThisGame` and stores
  `preparedHandEntities` in snapshot-facing state.
- Deduplicate same-entity replays within a short window (mirror Herald detector).

**Do not** increment on ordinary card play. Playing an already-Prepared card is
a normal `PLAY`.

## Snapshot Shape

Extend `DeckTrackerSnapshot.extraDisplay`:

```ts
{
  counters: {
    prepareCountThisGame?: number;
    bribeCoinsGivenToOpponentThisGame?: number;
    // existing keys unchanged
  };
  preparedHand: Array<{
    entityId: number;
    cardId: string;
    baseCost: number;
    effectiveCost: number;
    discount: number;
    preparedAtTurn: number;
  }>;
  pools: {
    demonsRemainingInDeck?: ExtraDisplayPoolEntry[];
    // existing pools unchanged
  };
}
```

Rules:

- `prepareCountThisGame` absent or `0` before the first Prepare.
- `preparedHand` lists only hand entities currently carrying a Prepare discount.
  Remove entries when the entity leaves hand (played, discarded, destroyed).
- Refresh `effectiveCost` from live entity `COST` tag when log updates arrive;
  fall back to stored discount if tag is missing.

`demonsRemainingInDeck`:

- Recompute each snapshot from `remaining` + card metadata race `DEMON`.
- Used by `JAIL_906` hover: `牌库恶魔：N`.

## Bribe Semantics (minimal)

`CATA_EVENT_402` — Deadly Bribe:

- On local-player `PLAY`, if combo active (`cardsPlayedThisTurn > 1` before this
  spell resolves), increment a ephemeral UI flag only; no new counter required
  beyond existing `cardsPlayedThisTurn`.
- When the effect grants opponent a Coin, increment
  `bribeCoinsGivenToOpponentThisGame` if log shows `GAME_005` (or equivalent
  token) moving to opponent hand with attribution to this play. If attribution
  is ambiguous, increment conservatively on `SHOW_ENTITY` of Coin in opponent
  hand inside the spell block.

Future Bribe cards should use a `BRIBE` referenced tag once hsdata adds it.

## UI And Overlay

### Prepare keyword (data-driven, like Herald)

Row hover on Prepare caster / reference cards:

- `本局已预备：N 次`
- If this hand entity is in `preparedHand`, also show `已预备，费用 -X（当前 Y）`

Hand row badge:

- When entity appears in `preparedHand`, show `预备 -{discount}` near cost.

Header / player overlay:

- `KeywordCounterStrip` gains a `预备 N` chip parallel to `兆示 N`.
- Show when deck/hand/board contains a Prepare card **or**
  `prepareCountThisGame > 0`.
- Numeric portion uses `font-mono` / `tabular-nums`.

### Released card hovers (Phase 2)

| cardId | Hover line(s) |
|---|---|
| `JAIL_407` | On board: `本回合已打出：N 张` (from `cardsPlayedThisTurn`) |
| `JAIL_906` | `牌库恶魔：N` from `demonsRemainingInDeck` |
| `CATA_EVENT_400` | Prepare lines + `战吼消耗当前剩余法力` when in hand |
| `CATA_EVENT_401` | Prepare lines only |
| `CATA_EVENT_402` | `连击：已满足` / `连击：未打出其他牌` from `cardsPlayedThisTurn` |

Register `JAIL_906` in `standard-extra-display-candidates` with
`stateNeeded: ["demonsRemainingInDeck"]` when implementing Phase 2 card-specific
rows. Prepare lines stay data-driven and need no JSON review entry.

Opponent overlay:

- No opponent Prepare chip.
- No opponent Prepare discount on hidden hand.

## Relationship To Deck Tracking

| Concern | Behavior |
|---|---|
| `remaining` | Unchanged by Prepare hop (card does not leave the library net) |
| `knownPositions` | Not used for Prepare |
| `extras` | Vanessa/Moragg/Crook random spawns still go to `extras` |
| Entity map | Must track hand entity `COST` overrides |

## Risks

- **Unknown log shape:** Prepare may use a block type not yet seen in tests. Keep
  detection isolated in `prepare-action-detector.ts` with fixture-driven tests;
  extend when live logs arrive.
- **Duplicate streams:** GameState + PowerTaskList may duplicate zone changes;
  dedupe by entity + turn + discount delta.
- **Cost tag timing:** `COST` may update before or after zone return; detector
  should accept either order within one block.
- **Partial expansion data:** Only five EVH collectibles exist now; Disguise and
  Rulebreaker sections are architectural placeholders.
- **`CATA_EVENT_*` prefix:** Promo cards reuse the Cataclysm prefix but belong
  to SET_1941; cardId prefix must not be used for set detection.

## Verification

- `pnpm exec vitest run scripts/convert-hsdata-cards.test.ts`
- `pnpm --filter @hdt/core test prepare extra-display-state`
- `pnpm --filter @hdt/desktop test LiveDeckPanel OverlayView`
- `pnpm cards:convert` — `JAIL_407` / `CATA_EVENT_401` show `PREPARE` metadata
- `pnpm typecheck`

## Future: Disguise / Rulebreaker (not in Phase 0–2)

Documented for follow-up specs:

- `minionBoardSideForEntity` — friendly vs opposing board under player control.
- `disguisedMinionsPlayedThisGame` — count of Disguise plays to opponent board.
- `activeRulebreakersThisGame` + `globalEffect.<cardId>` — rest-of-game rule
  changes (deck cap 99, extra draws, duplicate legendaries).

See `data/cards/schema/stateNeeded-vocabulary.md` EVH section for key names.
