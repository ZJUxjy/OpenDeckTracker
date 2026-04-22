## ADDED Requirements

### Requirement: getDecks returns the player's saved deck list

The `#[napi]` function `getDecks` SHALL iterate
`CollectionManager.s_instance.m_decks` (a
`Blizzard.T5.Core.Map<long, CollectionDeck>`) using
`crate::collections::custom_map::iter_entries` and return an array
of `DeckResult` records, one per saved deck.

Each `DeckResult` MUST contain:

- `id: i64` — `CollectionDeck.ID`
- `name: String` — `CollectionDeck.m_name`
- `hero: String` — `CollectionDeck.<HeroCardID>k__BackingField`
- `formatType: i32` — `CollectionDeck.<FormatType>k__BackingField`
- `deckType: i32` — `CollectionDeck.<Type>k__BackingField`
- `seasonId: i32` — `CollectionDeck.SeasonId`
- `cardbackId: i32` — `CollectionDeck.CardBackID`
- `createDateMicrosec: i64` — `CollectionDeck.CreateDate`
- `cards: DeckCard[]` — derived from `CollectionDeck.m_slots`

Each `DeckCard` MUST contain `{ cardId: String, count: i32, premium:
i32 }`. `cardId` is read directly from `CollectionDeckSlot.m_cardId`;
`count` is read via the boxed-int helper (see separate requirement
below); `premium` is reported as `0` because `CollectionDeckSlot` does
not declare a premium field.

The function MUST return `null` (NAPI `Ok(None)`) when:

- `CollectionManager` class cannot be resolved.
- `CollectionManager.s_instance` is NULL (pre-login).

The function MUST return `Ok(Some(vec![]))` when CollectionManager
exists but `m_decks` is null OR the map is empty (legitimate
zero-decks state).

The function MUST NOT return `Err` for the
"`collection iteration exceeded max_items`" condition that today's
broken `dict::iter_entries` path produces — this is precisely the bug
this requirement fixes.

#### Scenario: User with three saved decks

- **GIVEN** Hearthstone is logged in and the user has 3 saved
  CollectionDecks
- **WHEN** `getDecks()` is called
- **THEN** the result has `decks.length === 3`, each entry has a
  non-empty `name` and a `cards.length` between 1 and 30

#### Scenario: Pre-login returns null

- **GIVEN** Hearthstone has just launched and is at the login splash
- **WHEN** `getDecks()` is called
- **THEN** the result is `null`

#### Scenario: Logged-in but no decks

- **GIVEN** a fresh account with no saved decks
- **WHEN** `getDecks()` is called
- **THEN** the result has `decks.length === 0` (NOT `null`)

### Requirement: getEditedDeck reflector

The `#[napi]` function `getEditedDeck` SHALL return the deck currently
open in the in-game collection editor as a `DeckResult` (same shape as
`getDecks` entries) or `null` when no deck is being edited.

Resolution path:

1. Resolve `CollectionManager.s_instance` (same as `getDecks`).
2. Read `m_EditedDeck` field as a pointer.
3. If non-null, materialise it as a `MonoObject` and feed through the
   same per-deck reader used by `getDecks`.

The reflector MUST return `null` for any of:

- `CollectionManager` not initialised.
- `m_EditedDeck` is NULL (user is not on the deck-edit screen).
- The deck object's required fields are unreadable (defensive — should
  not happen for a valid `m_EditedDeck`).

#### Scenario: User is editing a deck

- **GIVEN** the user has navigated to "My Collection" → opened a deck
  for editing
- **WHEN** `getEditedDeck()` is called
- **THEN** the result is a `DeckResult` matching the deck being
  edited, with current (possibly mid-edit) `cards` contents

#### Scenario: User is on Play screen

- **GIVEN** the user is on the Play / Mode screen, not in the
  collection editor
- **WHEN** `getEditedDeck()` is called
- **THEN** the result is `null`

### Requirement: Boxed-int unwrap helper for CollectionDeckSlot.m_count

The deck reader SHALL provide a helper
`read_boxed_int(rt, ptr) -> i32` that:

- Returns `1` (default deck-slot count) when `ptr == 0`.
- Otherwise reads `i32` from `ptr + 0x10` (Mono boxed `int` value
  offset, stable across recent runtime versions).

The constant `0x10` MUST be expressed as a named `const` (e.g.
`BOXED_INT_VALUE_OFFSET: usize = 0x10`) with a comment naming the
verification source (upstream `D:\code\hearthmirror-rs`
`hm-rpc/src/handler.rs::read_slot_count`, with the
`debug_read_raw` probe trace at lines 709–798 documenting the
empirical layout).

#### Scenario: Real deck slot

- **GIVEN** a `CollectionDeckSlot` with `m_count` pointing at a
  boxed int storing 2
- **WHEN** `read_boxed_int(&rt, count_ptr)` is called
- **THEN** the result is `2`

#### Scenario: Null count pointer defaults to 1

- **GIVEN** a slot with `m_count == NULL`
- **WHEN** `read_boxed_int(&rt, 0)` is called
- **THEN** the result is `1` (CollectionDeckSlot's documented
  default — slots written without an explicit count mean "one copy")

### Requirement: getMatchInfo aggregates GameMgr + GameState

The `#[napi]` function `getMatchInfo` SHALL return a
`MatchInfoResult` aggregating:

- From the `GameMgr` service (via `ServiceLocator`):
  - `gameType: i32` (`m_gameType`, default 0)
  - `formatType: i32` (`m_formatType`, default 0)
  - `missionId: i32` (`m_missionId`, default 0)
- From `GameState.s_instance.m_playerMap` walk:
  - `localPlayer: MatchPlayerResult | null` — the entry whose
    `Player.m_local == true`, populated with `id`, `name`, `side`
    (1=friendly, 2=opposing per Hearthstone enum), and `cardbackId`.
  - `opposingPlayer: MatchPlayerResult | null` — the other entry.
- Reserved season-id slots (`rankedSeasonId`, `arenaSeasonId`,
  `brawlSeasonId`) — set to 0 in this iteration; will be wired up in
  a follow-up change once MedalInfo translation is integrated.

The function MUST return `null` (NAPI `Ok(None)`) when neither
`GameMgr` nor `GameState` is reachable. When `GameMgr` exists but
`GameState` does not, it MUST return a result with the GameMgr-side
fields populated and `localPlayer / opposingPlayer = null` (this is
the "in main-menu but a service is registered" case).

#### Scenario: Active ranked Standard match

- **GIVEN** Hearthstone has an active ranked Standard match
- **WHEN** `getMatchInfo()` is called
- **THEN** `result.formatType === 2` (FT_STANDARD), `result.gameType
  > 0`, `result.localPlayer != null`, and `result.localPlayer.name`
  matches the friendly BattleTag

#### Scenario: Pre-match returns null

- **GIVEN** Hearthstone has just launched (no GameMgr yet)
- **WHEN** `getMatchInfo()` is called
- **THEN** the result is `null`

### Requirement: getGameType reflector via ServiceLocator

The `#[napi]` function `getGameType` SHALL resolve `GameMgr` via
`ServiceLocator.get_service("GameMgr")` and return
`{ gameType: i32 | null, formatType: i32 | null, missionId: i32 | null }`.

When the `GameMgr` service is not registered, all three fields MUST
be `null`. Field-read errors on individual fields MUST default to
`null` (do NOT propagate `Err`).

#### Scenario: GameMgr available

- **GIVEN** Hearthstone is past the main menu (GameMgr registered)
- **WHEN** `getGameType()` is called
- **THEN** all three fields are non-null integers (each reflects the
  current PegasusShared.GameType / FormatType / MissionType state)

#### Scenario: GameMgr not registered

- **GIVEN** Hearthstone is at the very early splash screen
- **WHEN** `getGameType()` is called
- **THEN** all three fields are `null`

### Requirement: getServerInfo reads inline NetworkState struct

The `#[napi]` function `getServerInfo` SHALL resolve the current
game-server connection info by walking:

1. `ServiceLocator.get_service("Network")` → `Network` instance
2. `Network.m_state` (a value-type `NetworkState` struct INLINED at
   the field's offset within `Network`)
3. From inside the inlined struct:
   `<LastGameServerInfo>k__BackingField` — pointer to a
   `GameServerInfo` reference object
4. Read fields off the `GameServerInfo` instance: `<Address>`, `<Port>`,
   `<GameHandle>`, `<ClientHandle>`, `<Version>`, `<SpectatorMode>`,
   `<Mission>`, `<SpectatorPassword>`, `<AuroraPassword>` (all
   `k__BackingField` auto-properties).

The implementation MUST tolerate the `NetworkState` class being named
either `Network+NetworkState` (Mono nested-class spelling) or bare
`NetworkState`, trying the qualified name first.

The function MUST return `null` for any of:

- `Network` service not registered.
- `<LastGameServerInfo>k__BackingField` reads NULL (no recent
  game connection).

#### Scenario: Mid-match server info

- **GIVEN** Hearthstone has an active match (Network service has a
  populated GameServerInfo)
- **WHEN** `getServerInfo()` is called
- **THEN** `result.address` is a non-empty string, `result.port > 0`,
  and `result.gameHandle > 0`

#### Scenario: Pre-connection returns null

- **GIVEN** Hearthstone has just launched (no Network service yet)
- **WHEN** `getServerInfo()` is called
- **THEN** the result is `null`

### Requirement: Inline value-type struct field walker helper

The library SHALL provide a helper
`struct_field_addr(rt, host_addr, struct_offset, struct_class,
field_name) -> Result<usize, ScryError>` (in
`packages/hearthmirror/native/src/reflection/server.rs` or a shared
utility module) that returns the absolute address of `field_name` on
a value-type struct inlined at `host_addr + struct_offset`.

The helper MUST:

1. Resolve `field_name` on `struct_class` via
   `MonoClass::find_field` (so it picks up auto-property backing
   fields with their `<Name>k__BackingField` spelling).
2. Return `host_addr + struct_offset + field_offset_within_struct`.
3. Return `Err(ScryError::FieldNotFound)` when `find_field` fails.

The helper does NOT dereference the address — callers read the value
themselves with the appropriate width / type.

#### Scenario: Walk to LastGameServerInfo

- **GIVEN** a `Network` instance and the `NetworkState` MonoClass
- **WHEN** `struct_field_addr(&rt, network.addr, m_state_offset,
  network_state_class, "<LastGameServerInfo>k__BackingField")` is
  called
- **THEN** the returned address points at a `GameServerInfo*` slot
  whose value (read as a pointer) is either NULL (no current game) or
  a valid `GameServerInfo` instance address
