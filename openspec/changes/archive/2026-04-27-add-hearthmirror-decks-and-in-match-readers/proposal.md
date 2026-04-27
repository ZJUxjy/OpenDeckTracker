## Why

`add-hearthmirror-service-locator` (Spike Run 10) closed R-16 by lighting up
3 NetCache reflectors and proving the live-bridge can read player identity +
medal info. The next bottleneck is the Tracker's *core value proposition*: the
overlay needs in-match observability (board / hand / deck / secrets / mulligan
choices) — none of which we can read today — and the deck management screens
need the player's saved decks list, which currently fails with
`collection iteration exceeded max_items=5000` (R-17).

Upstream `D:\code\hearthmirror-rs` (Phases 5 + 7, commits `f9199bc` /
`10225d4` / `53aa0cc`) shipped working live readers for both surfaces with
the same Mono runtime + ServiceLocator infrastructure we already have, so
this is a port-and-adapt rather than a clean-room design. Without it, the
DEVELOPMENT_PLAN.md Phase 4 "Overlay 系统" milestone (PlayerDeck /
OpponentDeck / BoardMinionOverlay components) has no data to render.

## What Changes

### New live-bridge readers (7 NAPI methods)

- **`getDecks`** — all of the player's saved CollectionDecks with cards
  (currently failing; rewire from `dict::iter_entries` to
  `custom_map::iter_entries` because `m_decks` is a
  `Blizzard.T5.Core.Map<long, CollectionDeck>`, not a `Dictionary`).
- **`getEditedDeck`** — the deck currently open in the in-game collection
  editor, surfaced via `CollectionManager.s_instance.m_EditedDeck`.
- **`getBoardState`** — friendly + opposing minions on the board (sorted
  by zone position, enchantments filtered out).
- **`getHandState`** — friendly hand cards + opposing hand count.
- **`getDeckState`** — friendly remaining deck (entity_id + card_id) +
  opposing deck count.
- **`getOpponentSecrets`** — opposing secrets currently in play.
- **`getChoices`** — active mulligan + general (e.g. Discover) choice groups.

### Repaired live-bridge readers (4 NAPI methods)

- **`getMatchInfo`** — currently null; rewire to walk
  `GameState.s_instance.m_playerMap` (Blizzard.T5.Core.Map) and aggregate
  per-player records (id / name / side / cardback).
- **`getGameType`** — currently null; route through
  `ServiceLocator.get_service("GameMgr").{m_gameType, m_formatType, m_missionId}`.
- **`getServerInfo`** — currently null; route through `Network` service →
  `m_state` (NetworkState **value-type struct** inlined in Network) →
  `<LastGameServerInfo>k__BackingField`. Requires a value-type struct field
  walker (new helper, used here for the first time).
- **`isMulligan`** — new; reads `MulliganManager.s_instance.mulliganChooseBanner`
  (Unity GameObject pointer; non-null = mulligan UI active).

### New shared infrastructure

- **`reflection::game_state::singleton`** — locate `GameState.s_instance` via
  `Assembly-CSharp.dll` (it has a real `s_instance`, unlike NetCache).
- **`reflection::entity::tag_reader`** — read a tag value from any entity by
  walking `<Tags>k__BackingField` (or fallback `m_tags`) → `m_values:
  Dictionary<int,int>` → look up `tag_key`. The 9 Hearthstone GAME_TAG
  constants we need (CONTROLLER=50, ZONE=49, CARDTYPE=202, ATK=47,
  HEALTH=45, DAMAGE=44, COST=48, ZONE_POSITION=263, ENTITY_ID=53) plus
  enums (TAG_ZONE.{PLAY=1, DECK=2, HAND=3, SECRET=7}, CardType.{HERO=3,
  MINION=4, SPELL=5, ENCHANTMENT=6, WEAPON=7}, ChoiceType.{MULLIGAN=1,
  GENERAL=2}) live in a new `reflection::tags` module.
- **`reflection::entity::iter_entity_map`** — iterate
  `GameState.s_instance.m_entityMap` (Blizzard.T5.Core.Map<int, Entity>)
  yielding `(entity_id, MonoObject)` pairs.
- **`reflection::entity::discover_player_ids`** — walk
  `GameState.s_instance.m_playerMap` and split into
  `(friendly_controller_id, opposing_controller_id)` by reading each
  Player's `m_local: bool`.
- **`MonoObject::read_field_inline_struct`** (or helper inside
  `reflection::server`) — given a value-type struct field on a host
  object, resolve the struct's `MonoClass` and read further fields by
  name with offsets relative to the struct's start.
- **Boxed-int unwrapping helper** — `CollectionDeckSlot.m_count` is a
  pointer to a boxed `int` (value at `+0x10`), so deck-slot reading needs
  a small helper that survives null pointers and zero-as-default.

Public NAPI module surface gains 7 new methods, modifies signatures of 3
existing returns (`getMatchInfo`, `getGameType`, `getServerInfo` were
returning `null`; now they return real shapes — TS layer just stops
treating them as missing).

## Capabilities

### New Capabilities

- `hearthmirror-in-match-state`: GameState singleton walking + Entity/Tag
  reading + 5 in-match reflectors (board / hand / deck / secrets /
  choices) + the GAME_TAG / TAG_ZONE / CardType / ChoiceType enum tables.
- `hearthmirror-deck-readers`: `getDecks` (custom_map rewire) +
  `getEditedDeck` + the boxed-int / value-type-struct helpers required to
  read deck slot counts and inline server-info structs.

### Modified Capabilities

- None (this change adds two new capabilities and a handful of new
  reflector files; it does NOT change the requirements of any
  already-archived spec). The existing `hearthmirror-class-resolution`
  and `hearthmirror-mono-probe` capabilities are consumed unchanged.

> Note: capabilities `hearthmirror-service-locator` and
> `hearthmirror-reflection-runtime` from the in-flight
> `add-hearthmirror-service-locator` change are NOT yet archived. This
> change consumes the live code (`crate::reflection::service_locator`,
> `MonoObject::field_offset` parent-walk) shipped by that change but does
> NOT touch its specs. R-16 archival happens independently.

## Impact

### Code

- `packages/hearthmirror/native/src/reflection/`:
  - **NEW** `tags.rs` — GAME_TAG / TAG_ZONE / CardType / ChoiceType
    constants + module-level docs naming the source enum.
  - **NEW** `entity.rs` — `read_entity_tag`, `iter_entity_map`,
    `discover_player_ids`, `read_entity_card_id`, `build_entity_result`.
  - **NEW** `board_state.rs` / `hand_state.rs` / `deck_state.rs` /
    `opponent_secrets.rs` / `choices.rs` / `edited_deck.rs` /
    `mulligan.rs` — one-NAPI-method-per-file (mirrors existing layout).
  - **MODIFIED** `decks.rs` — switch from `dict::iter_entries` to
    `custom_map::iter_entries`; add boxed-int unwrap for
    `CollectionDeckSlot.m_count`.
  - **MODIFIED** `match_info.rs` / `server.rs` / `game_state.rs` (currently
    holds `getGameType` + `isSpectating` + `isGameOver`) — wire through
    ServiceLocator instead of returning `null`.
  - **MODIFIED** `mod.rs` — register the 7 new modules.
  - **MODIFIED** `field_paths.rs` — add ~30 new field-name constants
    (CollectionDeck / CollectionDeckSlot / GameState / Entity /
    EntityBase / Player / Choices / GameServerInfo / Network /
    MulliganManager).
- `packages/hearthmirror/native/src/lib.rs` — register 7 new `#[napi]`
  exports.
- `packages/hearthmirror/native/src/mono/object.rs` — add
  `read_field_inline_struct(class_addr, field_name)` helper for the
  Network → NetworkState case. Add tests.
- `packages/hearthmirror/native/examples/dump_reflection.rs` — extend the
  formatter to print the new methods' summaries.
- **NEW** diagnostic examples for in-match validation:
  `diag_game_state.rs`, `diag_entity_map.rs`, `diag_player_map.rs`,
  `diag_choices.rs` (added on demand during implementation, mirroring
  R-16's `diag_*` pattern).
- **NEW** OpenSpec scenario fixtures + unit tests for the entity/tag
  walker (lives in `src/reflection/entity.rs` `#[cfg(test)]`).

### APIs

- 7 new `#[napi]`-exposed async methods on the
  `@hdt/hearthmirror-native` surface.
- 3 existing methods (`getMatchInfo`, `getGameType`, `getServerInfo`)
  start returning non-null shapes — TS callers must stop treating
  `null` as "always".
- 1 method (`getDecks`) flips from "always errors" to "returns the
  decks list".

### Dependencies

- None. All work uses already-imported `MonoRuntime` /
  `MonoObject` / `custom_map::iter_entries` / `dict::iter_entries`.

### Docs

- `docs/spikes/0003-hearthmirror-reflection-runtime-validation.md`
  gains a `## Run 11` section (Phase 5 + 7 reflectors live-validated).
- `DEVELOPMENT_PLAN.md` Phase 4 milestone gets a small note
  "live-bridge ready" pointing here.

### Risk

- **Low for the deck readers** — same map type + same chain shape we
  already exercise for `NetCacheMedalInfo.MedalData`.
- **Medium for in-match readers** — depend on `GameState.m_entityMap`
  being populated, which only happens during an active match. Validation
  requires being in a real game (not just main menu), and the
  controller-id discovery has known edge cases for spectator mode +
  Battlegrounds (different `m_local` semantics).

## Non-goals

- **No deck import / export, no deck code parsing** — those live in
  `packages/core/deck/` per `DEVELOPMENT_PLAN.md`. This change only
  exposes the *raw* live-bridge reads.
- **No live-state caching / diffing / event system** — the 7 reflectors
  are pull-only; the overlay polling layer + diff engine are a separate
  Phase-4 concern.
- **No Battlegrounds-specific board/hand reads** — the standard
  `m_entityMap` walk covers Battlegrounds boards too, but minion
  attributes (tier, taunt count, golden status) require additional tag
  reads (TIER_HIGHER_THAN_REQUIRED_HERO_LEVEL, etc.) deferred to a
  follow-up "battlegrounds-board-augments" change.
- **No archive of `add-hearthmirror-service-locator`** — that change
  archives on its own track; this proposal only depends on its already-
  merged code, not its OpenSpec status.
- **No NAPI-side type-shape preservation guarantees** — `MedalInfoData`
  shape was already changed by R-16; we treat that as the new baseline.
- **No replacement for log-parsing** — per
  `DEVELOPMENT_PLAN.md` 数据来源优先级, hearthmirror is *fallback only*
  when logs are insufficient. The TS overlay layer remains responsible
  for choosing which source wins.
