## Context

After R-16 closed, our live-bridge can resolve singletons via either
`s_instance` or the `ServiceLocator` chain, walk
`Blizzard.T5.Core.Map<K,V>` collections (via `collections::custom_map`),
and read inherited fields (via `MonoObject::field_offset` parent walk).
Six reflectors return live data in main-menu state (battleTag, accountId,
medalInfo, isSpectating, isGameOver, getCollection).

The remaining gaps are:

1. **Saved decks** — `getDecks` errors out with
   `CollectionOverflow{max=5000}` because `decks.rs` still routes through
   `dict::iter_entries` while `CollectionManager.m_decks` is a
   `Blizzard.T5.Core.Map<long, CollectionDeck>`. R-17 in spike 0003.
2. **In-match observability** — board / hand / deck-in-deck / secrets /
   choices are the entire reason a deck tracker exists, and we read 0%
   of them today.
3. **Three null reflectors that should work** — `getMatchInfo`,
   `getGameType`, `getServerInfo` were Phase-1 stubs that pre-dated
   ServiceLocator and never got rewired.

Upstream `D:\code\hearthmirror-rs` (Rust JSON-RPC daemon, not NAPI; commits
`f9199bc` Phase 5, `10225d4` Phase 7, `53aa0cc` follow-up tag fixes)
solves all three. Its handler is ~2000 LoC of read code with extensive
field-name probing comments. Our job is to port the chains, not the
transport — we keep our `napi-rs` exposure, our offset infrastructure,
and our error types.

The hardest piece is the **Entity / Tag system**: every in-match read
goes through `Entity.<Tags>k__BackingField → TagMap.m_values:
Dictionary<int,int>`, and Hearthstone's tag enum (GAME_TAG) is the only
source of truth for "is this entity a minion or an enchantment", "is it
on the board or in deck", "who controls it". Without a working tag
reader, every Phase-7 reflector is one indirection short of useful data.

### Stakeholders / consumers

- **Overlay layer** (`packages/overlay`, currently empty): consumes board
  / hand / opposing-info every ~250 ms during a match.
- **Deck Picker / Editor screens** (`apps/desktop/renderer/screens/`):
  consume `getDecks` once on enter + on deck-list mutation events from
  the log watcher.
- **Stats engine** (`packages/core/stats`): consumes `getMatchInfo` at
  game-end events to record opponent BattleTag / format.

## Goals / Non-Goals

**Goals:**

- 11 NAPI reflectors deliver live, validated data in their target game
  states (in-match for Phase-7 group, anywhere post-login for the deck
  group).
- A reusable `reflection::tags` + `reflection::entity` module pair so
  future Battlegrounds / Arena reflectors don't re-walk the Tag dictionary
  from scratch.
- Zero changes to the FFI / NAPI module organisation (still one file per
  reflector, still one `#[napi]` async fn per file, still
  `field_paths::FLD_*` constants).
- `dump_reflection` baseline jumps to **13 OK / 0 ERR** (was 6 OK / 1
  ERR) when measured during an active ranked Standard match.

**Non-Goals:**

- Caching, batching, or rate-limiting at the Rust layer — the JSON-RPC /
  NAPI layer above can poll at whatever rhythm it likes; reflectors stay
  pure read-and-return.
- Live diff / event streams ("entity X moved from HAND to PLAY"). The
  overlay's polling layer computes diffs in TS.
- Reading `Entity.<Tags>k__BackingField` for tag *names* (we read by
  numeric ID only — the GAME_TAG enum source-of-truth is HearthDb in TS).
- Spectator-mode in-match reads — `m_local: bool` semantics differ in
  spectate, and validating that requires putting the test account into
  spectator mode. Defer to a follow-up.
- Battlegrounds-specific augments (minion tier, taunt count, golden
  flag). Standard `m_entityMap` walk works for BG boards but per-minion
  augment reads need additional GAME_TAG lookups (TIER, TECH_LEVEL,
  CONTENTS) that are out-of-scope here.

## Decisions

### D1 — One module per reflector, one shared `entity.rs` for in-match plumbing

**Context.** Phase 7 has 5 reflectors that all walk
`GameState.s_instance.m_entityMap` and call `read_entity_tag` /
`read_entity_card_id` / `discover_player_ids`. Putting every reflector's
file at `src/reflection/<name>.rs` is our existing convention.

**Options:**

- (a) Inline the 4 shared helpers into each reflector file (duplicate
  ~80 LoC × 5).
- (b) Put helpers in a new `src/reflection/entity.rs` module that the
  5 in-match reflectors import.
- (c) Put helpers in `src/mono/object.rs` as more `MonoObject` methods.

**Choice: (b).**

**Rationale.** (a) is unmaintainable — fixing a tag-reader bug in one
file gives 4 stale copies. (c) leaks Hearthstone-specific concepts
(GAME_TAG / Player / Entity) into the language-agnostic Mono layer.
(b) keeps the layering clean: `mono::*` knows about CLR, `reflection::*`
knows about Hearthstone.

`src/reflection/entity.rs` re-exports just what the 5 reflectors need:

```text
pub fn iter_entity_map(rt, gs)            -> Vec<(i32, MonoObject)>
pub fn discover_player_ids(rt, gs)        -> (Option<i32>, Option<i32>)
pub fn read_entity_tag(rt, entity, key)   -> i32
pub fn read_entity_controller(rt, entity) -> i32   // tag 50 wrapper
pub fn read_entity_card_id(rt, entity)    -> String
pub fn build_entity_result(rt, entity, id) -> EntityResult
```

### D2 — Tag enum constants live in `src/reflection/tags.rs`, NOT replicated TS-side

**Context.** The 9 GAME_TAG values + 4 TAG_ZONE values + 6 CardType
values + 2 ChoiceType values that the 5 in-match reflectors need are
small but high-stakes (a typo silently filters the wrong entities).
The TS side already has the full `HearthDb/GameTag` enum with hundreds
of entries; we only need the ~21 we use here.

**Options:**

- (a) Hardcode the integers inline at each comparison site.
- (b) Mini-module `src/reflection/tags.rs` with `pub const CONTROLLER:
  i32 = 50;` etc., grouped under `mod tags { ... }`, `mod zone { ... }`,
  `mod card_type { ... }`, `mod choice_type { ... }`.
- (c) Generate the file from HearthDb's JSON.

**Choice: (b).**

**Rationale.** (a) loses the documentation point ("why 50? 50 means
CONTROLLER") and is grep-hostile when HearthDb adds a new tag. (c) is
overkill for 21 constants and adds a build-time TS→Rust dep that doesn't
exist yet. (b) matches the upstream layout 1:1, costs ~30 LoC, and lets
each reflector write `tags::CONTROLLER` instead of `50`.

The choice values come from upstream's verified set
(`hm-rpc/src/protocol.rs` `tags` / `zone` / `card_type` / `choice_type`
modules), which were live-validated against a running Hearthstone in
their Phase 7 commits.

### D3 — `getDecks` switch to `custom_map::iter_entries`, no schema change

**Context.** Today's `decks.rs` reads `m_decks` as a Dictionary, which
fails. Upstream `read_decks` (handler.rs:1351-1388) reads it as a
`Blizzard.T5.Core.Map<long, CollectionDeck>` via `iter_value_addrs`,
which is exactly what our `collections::custom_map::iter_entries`
already does (we verified it for `NetCacheMedalInfo.MedalData` in R-16).

**Choice.** Mechanical swap of the iteration call. Field names on
`CollectionDeck` (`ID`, `m_name`, `<HeroCardID>k__BackingField`, etc.)
match upstream; no investigation required.

`CollectionDeckSlot.m_count` is a pointer to a boxed `int` — value
sits at `+0x10` of the boxed object (verified by upstream's
`debug_read_raw` probe in handler.rs:709-798, locked to a constant
because Mono's box layout is stable). We add a 6-line
`read_boxed_int(ptr) -> i32` helper rather than expand `MonoObject` for
this single use.

### D4 — `Network.m_state` value-type struct read via offset-relative field walk

**Context.** Unlike all our other reflection chains where `field A is a
pointer to object B`, `Network.m_state` is a *value-type struct field*
(`NetworkState` is a C# `struct`, not a `class`) inlined into the
`Network` object's memory. Reading
`<LastGameServerInfo>k__BackingField` requires:

1. Find offset of `m_state` on `Network` class (gives byte offset within
   Network instance).
2. Find offset of `<LastGameServerInfo>k__BackingField` on `NetworkState`
   class (gives byte offset within the struct).
3. Read `network.addr + m_state_offset + backing_field_offset` as a
   pointer.

**Options:**

- (a) New `MonoObject::read_inline_struct_field(struct_class, field_name)`
  on the parent object.
- (b) Free helper `struct_field_addr(rt, host_addr, struct_offset,
  struct_class, field_name)` in `reflection/server.rs` (private).
- (c) Inline arithmetic at the one call site.

**Choice: (b).**

**Rationale.** (a) couples `MonoObject` to the concept of "value-type
struct fields" which is a one-off in the current chain set. (c) hides
the chain shape under raw arithmetic. (b) keeps the helper visible at
the only call site that needs it; promote to (a) when a second chain
needs the pattern.

`Network+NetworkState` may be a nested class — we try
`find_class("Network+NetworkState")` first, fall back to
`find_class("NetworkState")` (mirrors upstream).

### D5 — Tag dictionary fallback chain: `<Tags>k__BackingField` then `m_tags`

**Context.** `Entity` (the runtime in-match entity class) has a
`<Tags>k__BackingField` auto-property pointing at a `TagMap`. Its parent
`EntityBase` (used by collection cards' `EntityDef`) only has the older
`m_tags` field. The runtime Entity class is what
`GameState.m_entityMap` holds; collection-card `EntityDef`s reach the
same TagMap via the older field.

**Choice.** `read_entity_tag` tries `<Tags>k__BackingField` first;
falls back to `m_tags` if that returns NULL. Single helper covers both
the in-match entity reads AND the collection-side card-info debug reads
(useful for COST/ATK/HEALTH probes). Tag dictionary itself
(`TagMap.m_values`) is `Dictionary<int, int>` — uses our existing
`dict::iter_entries` with the corrected `+0x0C` / `+0x20` offsets from
R-16.

### D6 — Friendly/opposing controller IDs from `m_playerMap`, not via tag scan

**Context.** Each entity carries a CONTROLLER tag (50) whose value is
the controller's player id — but to know which player id is "us", we
need to find a player with `m_local == true` somewhere. Scanning every
entity for one with TAG_LOCAL would require a tag dict walk per entity.

**Options:**

- (a) Scan every entity, look at the first one with TAG_LOCAL == true,
  use its CONTROLLER.
- (b) Walk `GameState.m_playerMap` (Map<int, Player>) once and find the
  Player with `m_local == true` — that player's MAP-KEY is the
  friendly controller id (Hearthstone protocol: player id == controller
  tag value).
- (c) Hardcode `friendly = 1, opposing = 2` (works in single-player
  campaign; fails in spectator and multi-player).

**Choice: (b).**

**Rationale.** (a) is O(N entities × tag dict walk), (c) is wrong half
the time. (b) is one map walk, two field reads per player (`m_id`,
`m_local`), and converges with upstream's verified strategy. The map
key being the controller-tag value is a Hearthstone protocol invariant
documented in upstream's `hm-rpc/src/handler.rs:1474-1478`.

`m_local` is a plain `bool` field on `Player`; no auto-property
gymnastics needed.

### D7 — In-match reads return `Ok(None)` (not `null` shapes) when no match is active

**Context.** When the player is in main menu, `GameState.s_instance` is
NULL and there's no `m_entityMap` to walk. We could either return
`null` (single value) or an empty-but-valid result.

**Choice.** Return `Ok(None)` (which surfaces as `null` at the NAPI
layer) for ALL of `getBoardState` / `getHandState` / `getDeckState` /
`getOpponentSecrets` / `getChoices`. The TS layer already has to
distinguish "no match" from "empty board" anyway, and a literal `null`
is the cheapest signal.

`getDecks` and `getEditedDeck` use the same pattern: `Ok(Some(vec![]))`
when CollectionManager is reachable but the user has 0 decks (legitimate
empty), `Ok(None)` when the singleton itself is unreachable
(pre-login).

### D8 — Choice cards: read `<Entities>k__BackingField` as `List<int>` with raw i32 array reads

**Context.** `Choices.<Entities>k__BackingField` is a `List<int>`.
Our `ListView::read_object_pointers` assumes the elements are pointers,
which would re-interpret each `int` as an address pointer (junk).

**Choice.** Inline read: get the `_items` array pointer + `_size` from
the List, then read `array_data + i * 4` as raw i32. This is what
upstream does (handler.rs:1810-1827). We don't add a generic
`ListView::read_int_values` helper for one use site; if a second
`List<int>` consumer appears, promote then.

The entity IDs returned this way are then mapped back to card IDs by
re-walking `m_entityMap` and finding the entity whose key matches —
costly but correct, and choice groups have ≤ ~30 cards (Discover) so
the cost is bounded.

## Risks / Trade-offs

- **R1 — Tag dictionary may be empty during a state transition** →
  In-match reads can race with Hearthstone's "rebuilding entity tags"
  flush moments (turn boundary, animation start). We tolerate this by
  returning `0` for missing tags rather than erroring; the TS overlay
  layer should debounce 1-2 polls before treating zero values as truth.
- **R2 — `m_local` semantics in spectator mode** → When spectating,
  *both* players have `m_local == false` from the spectator's POV; our
  `discover_player_ids` would return `(None, Some(opposing))`. We
  surface this as `Ok(None)` from `getBoardState` etc., which is
  technically wrong (we *are* observing a real game, just not as
  participant). Mitigation: spectator mode is non-goal; defer the
  fix until the spectator reflector is needed (separate change).
- **R3 — `Network+NetworkState` nested class name resolution** → Mono
  spells nested classes as `OuterClass+InnerStruct`. If a Hearthstone
  build inlines or renames `NetworkState`, the fallback to bare
  `NetworkState` may resolve a wrong class. Mitigation: validate
  during dev with `diag_klass_fields`; if drift, the
  `read_inline_struct_field` helper can take an explicit class path
  rather than auto-discover.
- **R4 — Boxed-int layout drift** → Mono's box header is stable
  (`MonoObject` 8 bytes + value), but if a future build changes the
  GC layout, `read_i32(count_ptr + 0x10)` returns garbage. Mitigation:
  unit test asserts the offset constant; add a probe step in
  `dump_reflection` for a known deck to detect drift early.
- **R5 — Map iteration may trip the same `count` vs `touchedSlots`
  ambiguity that we hit in R-17** → Upstream uses `count` (live entries)
  while our `custom_map::iter_entries` uses `touchedSlots` (high
  watermark) + HashCode skip. Both should converge, but for `m_decks`
  with many add/delete cycles they could diverge. Mitigation: live
  validation runs both strategies on the same map and compares.
- **R6 — Performance of in-match reads** → Each
  `getBoardState` walks the entire `m_entityMap` (typically 50-150
  entities) and does ~4 tag-dict lookups per entity. At 4 Hz polling
  that's ~600-1800 cross-process reads/sec — within budget for the
  i686 subprocess (we measured ~3000 reads/sec capacity in spike
  0003) but no headroom for a second concurrent reader. Mitigation:
  the 5 reflectors share a single entity-map walk when called in the
  same poll cycle (TS-side batching, not Rust-side caching).
- **R7 — `CollectionManager.m_EditedDeck` is null between editor
  sessions** → `getEditedDeck` returns `Ok(None)` when the player isn't
  on the deck-edit screen. Documented as "look at Deck Picker for
  saved decks; this only fires when actively editing".

## Migration Plan

No migration needed in the runtime — the change is additive (7 new
methods) plus 4 unsticking-from-null fixes.

For TS callers:

- `getDecks` consumers should remove their "always returns error"
  guard and start consuming the result (`null` → no CollectionManager,
  `[]` → empty list, `[deck, ...]` → real data).
- `getMatchInfo` / `getGameType` / `getServerInfo` consumers should
  remove their "always returns null" guard.

Rollback: revert the change set. Reverts to today's "11 reflectors
return null / error" state. No database migration, no FFI shape change
beyond adding new methods (which old TS callers simply don't call).

## Open Questions

- **Q1 — Should `getHandState.opposing_hand_count` include cards in
  hand zone for `cardtype == ENCHANTMENT`?** Upstream filters
  enchantments out of the *board* but not out of the hand count.
  Pragmatically the hand never holds enchantments, but we should match
  upstream behaviour for now and revisit only if a real-game test
  shows wrong counts.
- **Q2 — Should `getDecks` filter out the `m_EditedDeck` (transient
  edit copy)?** Upstream returns ALL deck values from the map,
  including the editor's transient copy if present. We follow that
  for fidelity.

(Both flagged as "match upstream and document"; non-blocking.)
