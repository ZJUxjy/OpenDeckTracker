## ADDED Requirements

### Requirement: GAME_TAG / TAG_ZONE / CardType / ChoiceType constant tables

`packages/hearthmirror/native/src/reflection/tags.rs` SHALL expose the
Hearthstone enum constants used by all in-match reflectors as
`pub const` values inside per-enum sub-modules.

The tables MUST include at minimum:

- `mod tags` — `DAMAGE = 44`, `HEALTH = 45`, `ATK = 47`, `COST = 48`,
  `ZONE = 49`, `CONTROLLER = 50`, `ENTITY_ID = 53`, `CARDTYPE = 202`,
  `ZONE_POSITION = 263`.
- `mod zone` — `PLAY = 1`, `DECK = 2`, `HAND = 3`, `SECRET = 7`.
- `mod card_type` — `HERO = 3`, `MINION = 4`, `SPELL = 5`,
  `ENCHANTMENT = 6`, `WEAPON = 7`, `HERO_POWER = 10`.
- `mod choice_type` — `MULLIGAN = 1`, `GENERAL = 2`.

Each constant MUST carry a doc-comment naming the C# enum source
(`HearthDb.Enums.GameTag` / `TAG_ZONE` / `CardType` / `ChoiceType`) so
future contributors can cross-reference.

#### Scenario: Constants match upstream verified values

- **WHEN** any reflector compares an entity attribute against a tag
  constant
- **THEN** the constant value MUST equal the value used by upstream
  `D:\code\hearthmirror-rs/hearthmirror/crates/hm-rpc/src/protocol.rs`
  (live-validated 2026-04-21 in upstream commits `10225d4` /
  `53aa0cc`)

### Requirement: GameState singleton resolver

`packages/hearthmirror/native/src/reflection/entity.rs` SHALL provide
a function `read_game_state_singleton(rt) -> Result<Option<MonoObject>,
ScryError>` that resolves `GameState.s_instance` from
`Assembly-CSharp.dll`.

The function MUST return `Ok(None)` (not error) when:

- `GameState` class cannot be found in the AC image (uninstalled / pre-init).
- `GameState` has no `runtime_info` (cctor never ran).
- `s_instance` static field is NULL (no active match — main menu state).

The function MUST return `Err` only on genuine memory-read failures.

#### Scenario: Main menu returns Ok(None)

- **GIVEN** Hearthstone is at the main menu (no match running)
- **WHEN** `read_game_state_singleton(&rt)` is called
- **THEN** the result is `Ok(None)`

#### Scenario: In-match returns the GameState MonoObject

- **GIVEN** Hearthstone has an active ranked match
- **WHEN** `read_game_state_singleton(&rt)` is called
- **THEN** the result is `Ok(Some(gs))` where `gs.class_name() == "GameState"`

### Requirement: Entity tag dictionary reader

The library SHALL provide
`reflection::entity::read_entity_tag(rt, entity, tag_key) ->
Result<i32, ScryError>` to look up a single tag value from any
Hearthstone entity object.

The reader MUST resolve the tag dictionary by trying field names in
this order:

1. `<Tags>k__BackingField` (runtime `Entity` auto-property — used by
   `m_entityMap` entries).
2. `m_tags` (legacy `EntityBase` field — used by collection-side
   `EntityDef` instances).

Once a non-null tag-map pointer is obtained, the reader MUST:

- Read `m_values` from the TagMap as a `Dictionary<int, int>` pointer.
- Iterate the dictionary with the standard 16-byte entry size
  (`hashCode i32, next i32, key i32, value i32`).
- Return the value for the entry whose `key == tag_key` and `hashCode
  >= 0` (live entry).
- Return `0` when no entry matches OR the tag dictionary is null
  (Hearthstone's default for "tag not set").

The reader MUST NOT return `Err` for the "tag absent" case — only for
genuine memory-read failures.

#### Scenario: Read CONTROLLER tag from a board minion

- **GIVEN** an entity in the friendly player's PLAY zone
- **WHEN** `read_entity_tag(&rt, &entity, tags::CONTROLLER)` is called
- **THEN** the returned i32 equals the player id of the friendly
  controller (matching `discover_player_ids`'s `friendly` value)

#### Scenario: Tag dictionary missing returns 0

- **GIVEN** an entity object with both `<Tags>k__BackingField` and
  `m_tags` fields reading NULL
- **WHEN** `read_entity_tag(&rt, &entity, anything)` is called
- **THEN** the result is `Ok(0)`

### Requirement: Entity map iteration

The library SHALL provide
`reflection::entity::iter_entity_map(rt, gs) -> Result<Vec<(i32,
MonoObject)>, ScryError>` that iterates
`GameState.s_instance.m_entityMap` (a `Blizzard.T5.Core.Map<int,
Entity>`) and yields `(entity_id, entity_object)` pairs.

The iteration MUST use `crate::collections::custom_map::iter_entries`
(or an equivalent int-key helper) to read entries from the map's
`keySlots` / `valueSlots` arrays. Null value pointers MUST be skipped
silently.

#### Scenario: In-match yields entity entries

- **GIVEN** Hearthstone has an active match in the early game
- **WHEN** `iter_entity_map(&rt, &gs)` is called
- **THEN** the returned Vec is non-empty and every `(entity_id, entity)`
  has `entity_id > 0` and `entity.class_name()` matches one of
  `Entity` / `EntityBase` / similar Hearthstone runtime entity classes

#### Scenario: Empty map returns empty vec

- **GIVEN** GameState exists but `m_entityMap` reads NULL (between
  match init phases)
- **WHEN** `iter_entity_map(&rt, &gs)` is called
- **THEN** the result is `Ok(vec![])`

### Requirement: Friendly / opposing controller id discovery

The library SHALL provide
`reflection::entity::discover_player_ids(rt, gs) -> (Option<i32>,
Option<i32>)` that walks `GameState.s_instance.m_playerMap` and
returns `(friendly_controller_id, opposing_controller_id)` based on
each Player's `m_local: bool` field.

The map key for each Player entry IS the controller id (Hearthstone
protocol invariant: player id == TAG_CONTROLLER value).

When `m_local == true` the player's id goes into the `friendly` slot;
all other players (typically one) go into the `opposing` slot.

When `m_playerMap` is null or contains no entries, the result MUST be
`(None, None)`.

#### Scenario: Standard 1v1 match

- **GIVEN** Hearthstone has an active ranked Standard match
- **WHEN** `discover_player_ids(&rt, &gs)` is called
- **THEN** the result is `(Some(f), Some(o))` where `f != o` and
  `f, o ∈ {1, 2}` (both player ids are present and distinct)

#### Scenario: Pre-match returns (None, None)

- **GIVEN** GameState exists but `m_playerMap` is empty (mulligan
  pre-deal phase)
- **WHEN** `discover_player_ids(&rt, &gs)` is called
- **THEN** the result is `(None, None)`

### Requirement: getBoardState reflector

The `#[napi]` function `getBoardState` SHALL return
`{ friendly: EntityResult[], opposing: EntityResult[] }` where each
`EntityResult` carries `{ entityId, cardId, zonePosition, attack,
health, damage }`.

Selection criteria for an entity to appear in either array:

- `read_entity_tag(entity, tags::ZONE) == zone::PLAY`
- `read_entity_controller(entity)` matches the corresponding
  controller id from `discover_player_ids`
- `read_entity_tag(entity, tags::CARDTYPE) != card_type::ENCHANTMENT`
  (enchantments are filtered out — they belong to the parent minion's
  effects, not the board display)

Both arrays MUST be sorted ascending by `zone_position`.

The function MUST return `null` (NAPI `Ok(None)`) when:

- `GameState.s_instance` is NULL (no match).
- Either friendly or opposing controller id discovery returns `None`.

#### Scenario: Friendly minion present on board

- **GIVEN** the friendly player has 2 minions in PLAY (at positions 1
  and 2)
- **WHEN** `getBoardState()` is called
- **THEN** `friendly.length === 2`, `friendly[0].zonePosition === 1`,
  and both entries have non-empty `cardId`

#### Scenario: Enchantments filtered out

- **GIVEN** a friendly minion has an attached enchantment entity in
  the same PLAY zone
- **WHEN** `getBoardState()` is called
- **THEN** the enchantment entity does NOT appear in `friendly`

### Requirement: getHandState reflector

The `#[napi]` function `getHandState` SHALL return
`{ friendlyHand: HandCard[], opposingHandCount: number }` where
`HandCard = { entityId, cardId, zonePosition }`.

`friendlyHand` contains all entities where
`read_entity_tag(entity, tags::ZONE) == zone::HAND` and
`read_entity_controller(entity) == friendly_id`, sorted by
`zone_position`.

`opposingHandCount` is the count of entities where the same zone
filter holds and `read_entity_controller(entity) == opposing_id`. The
opposing hand cards' `cardId` MUST NOT be reported (information leak —
opposing hand cards are unknown to the friendly player except for
specific revealed cards, which are out-of-scope here).

Returns `null` under the same conditions as `getBoardState`.

#### Scenario: Mulligan-finished hand

- **GIVEN** the friendly player has 4 cards in hand after the
  mulligan replace
- **WHEN** `getHandState()` is called
- **THEN** `friendlyHand.length === 4`, `opposingHandCount === 5`
  (standard mulligan: friendly 3 + coin OR 4, opposing 4 + 1 unkept)

### Requirement: getDeckState reflector

The `#[napi]` function `getDeckState` SHALL return
`{ friendlyDeck: InMatchDeckCard[], opposingDeckCount: number }`
where `InMatchDeckCard = { entityId, cardId }`.

Selection criteria mirror `getHandState` but for `zone::DECK`. Order
of `friendlyDeck` entries is unspecified (deck cards have no
meaningful zone position — they're shuffled).

The friendly deck cards' `cardId` is included because the player's
own deck composition is known to them at game start.

#### Scenario: Mid-game friendly deck count

- **GIVEN** the friendly player has drawn 5 cards from a 30-card
  deck
- **WHEN** `getDeckState()` is called
- **THEN** `friendlyDeck.length === 25`

### Requirement: getOpponentSecrets reflector

The `#[napi]` function `getOpponentSecrets` SHALL return
`{ secrets: SecretEntity[], count: number }` where
`SecretEntity = { entityId, cardId, zonePosition }`.

`secrets` contains all entities where
`read_entity_tag(entity, tags::ZONE) == zone::SECRET` and
`read_entity_controller(entity) == opposing_id`.

The opposing secrets' `cardId` IS reported — this is intentional even
though it's an information leak from the opponent's perspective. HDT
historically exposes this for research/training purposes; users with
fairness concerns can disable display in the UI.

`count` mirrors `secrets.length`.

#### Scenario: Opposing has 2 secrets in play

- **GIVEN** the opposing player has cast 2 secret cards this turn
- **WHEN** `getOpponentSecrets()` is called
- **THEN** `count === 2` and `secrets.length === 2`, with each
  `secrets[i].cardId` being a known secret card id

### Requirement: getChoices reflector

The `#[napi]` function `getChoices` SHALL return
`{ mulligan: ChoiceGroup | null, general: ChoiceGroup | null }`
where `ChoiceGroup = { sourceEntityId, countMin, countMax, cards:
ChoiceCard[] }` and `ChoiceCard = { entityId, cardId }`.

The reflector iterates `GameState.s_instance.m_choicesMap`
(`Blizzard.T5.Core.Map`) and demultiplexes entries by
`<ChoiceType>k__BackingField`:

- `choice_type::MULLIGAN (1)` → `mulligan` slot
- `choice_type::GENERAL (2)` → `general` slot
- All other ChoiceType values → silently dropped

For each choice group, `cards` is read from `<Entities>k__BackingField`
treating the underlying `List<int>` as an array of i32 entity ids
(NOT as object pointers). Each entity id is then resolved to a card id
by walking `m_entityMap` and matching the entity whose key equals the
target id; on no-match, `cardId` is the empty string.

When `m_choicesMap` is null both slots return `null`.

#### Scenario: Mulligan in progress

- **GIVEN** the friendly player is at the mulligan phase
- **WHEN** `getChoices()` is called
- **THEN** `mulligan != null`, `mulligan.cards.length` is 3 or 4
  (standard or going-second), every `mulligan.cards[i].cardId` is a
  known card id

#### Scenario: Discover effect active

- **GIVEN** the friendly player triggers a Discover effect
- **WHEN** `getChoices()` is called
- **THEN** `general != null`, `general.countMin === general.countMax
  === 1`, and `general.cards.length === 3`

### Requirement: In-match readers degrade gracefully outside of matches

The 5 in-match reflectors SHALL return `null` (NAPI `Ok(None)`) — never `Err` — when no match is active.

This requirement covers `getBoardState`, `getHandState`,
`getDeckState`, `getOpponentSecrets`, and `getChoices`. The
"no match active" condition MUST include all of the following
pre-match states:

- Hearthstone is at the main menu / login splash
- The user is in collection edit mode (no GameState singleton)
- A match is loading (GameState exists but `m_playerMap` is empty)

This makes the TS overlay layer's "no match → hide widget" logic a
single null-check rather than an error-handling matrix.

#### Scenario: Main menu polls all five with null result

- **GIVEN** Hearthstone is at the main menu
- **WHEN** the TS layer polls `getBoardState` / `getHandState` /
  `getDeckState` / `getOpponentSecrets` / `getChoices`
- **THEN** all five return `null` and none throw or return a
  non-null shape with empty arrays

### Requirement: isMulligan reflector

The `#[napi]` function `isMulligan` SHALL return
`{ mulligan: boolean | null }` indicating whether the mulligan
choose-banner UI is active.

The reflector reads
`MulliganManager.s_instance.mulliganChooseBanner` (a Unity GameObject
pointer); the result is:

- `Some(true)` when the pointer is non-null (banner instantiated /
  visible).
- `Some(false)` when the pointer is null (banner not active).
- `None` when `MulliganManager.s_instance` itself is null
  (uninitialised — typical at main menu).

#### Scenario: Mulligan UI active

- **GIVEN** the friendly player is at the mulligan choose phase
- **WHEN** `isMulligan()` is called
- **THEN** the result is `{ mulligan: true }`

#### Scenario: Main menu

- **GIVEN** Hearthstone is at the main menu
- **WHEN** `isMulligan()` is called
- **THEN** the result is `{ mulligan: null }`
