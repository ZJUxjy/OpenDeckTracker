//! Centralized field path string constants for all 12 IReflection methods.
//!
//! All field names that appear in Hearthstone's C# classes are collected here
//! to keep them in one place and make version-drift maintenance easier.
//! See `docs/superpowers/research/2026-04-20-hearthmirror-field-paths.md` for
//! the full chain documentation.

// ── Singleton class names (namespace, name) ──────────────────────────────────

/// `NetCache` MonoClass identifier (Assembly-CSharp.dll). No longer
/// consulted by `getBattleTag` / `getAccountId` / `getMedalInfo` — those
/// reflectors now go through the `ServiceLocator` (R-16, change
/// `add-hearthmirror-service-locator`) because `NetCache` does NOT
/// declare an `s_instance` field. Retained for documentation / audit
/// trail and any future code path that needs the class itself rather
/// than the live IService instance.
pub const CLS_NET_CACHE: (&str, &str) = ("", "NetCache");
pub const CLS_GAME_STATE: (&str, &str) = ("", "GameState");
pub const CLS_GAME_MGR: (&str, &str) = ("", "GameMgr");
pub const CLS_COLLECTION_MANAGER: (&str, &str) = ("", "CollectionManager");
pub const CLS_DRAFT_MANAGER: (&str, &str) = ("", "DraftManager");
pub const CLS_BACON_RATING_MGR: (&str, &str) = ("", "BaconRatingMgr");
pub const CLS_NETWORK: (&str, &str) = ("", "Network");

// ── Common field names ───────────────────────────────────────────────────────

pub const FLD_S_INSTANCE: &str = "s_instance";

// ── ServiceLocator chain (R-16) ──────────────────────────────────────────────
//
// `Blizzard.T5.Services.ServiceManager` lives in
// `Blizzard.T5.ServiceLocator.dll`, NOT `Assembly-CSharp.dll`. It exposes a
// single static field `s_runtimeServices` of type
// `Blizzard.T5.Services.ServiceLocator`, whose `m_services` field is a
// `Dictionary<Type, ServiceInfo>`. Each `ServiceInfo` carries the
// `Type.Name` string in `<ServiceTypeName>k__BackingField` and the live
// `IService` instance in `<Service>k__BackingField`. See spike 0003 Run 7
// + the change design doc for the verified field layout.

pub const SVC_LOCATOR_DLL: &str = "Blizzard.T5.ServiceLocator.dll";
pub const CLS_SERVICE_MANAGER: (&str, &str) =
    ("Blizzard.T5.Services", "ServiceManager");
pub const FLD_S_RUNTIME_SERVICES: &str = "s_runtimeServices";
pub const FLD_M_SERVICES: &str = "m_services";
pub const FLD_SERVICE_TYPE_NAME: &str = "<ServiceTypeName>k__BackingField";
pub const FLD_SERVICE: &str = "<Service>k__BackingField";

// Service identifiers (Type.Name strings as registered with ServiceManager).
pub const SVC_NET_CACHE: &str = "NetCache";

// ── BnetPresenceMgr chain (R-16 Phase 2) ─────────────────────────────────────
//
// `BnetPresenceMgr` is the Assembly-CSharp singleton that owns the live
// player's identity. Discovered after Spike Run 9 confirmed `NetCache.m_netCache`
// no longer carries `NetCacheBattleTag` / `NetCacheBnetAccountInfo` (those
// have been migrated out of NetCache in current Hearthstone builds).
//
// Verified live (HDT diag_static_chain, see Spike Run 10):
//   BnetPresenceMgr.s_instance
//     ├─ m_myBattleNetAccountId  (Blizzard.GameService.SDK.Client.Integration.BnetAccountId)
//     │    └─ <EntityId>k__BackingField  (Blizzard.GameService.Protocol.EntityId)
//     │         ├─ high_ : ulong @ +0x10
//     │         └─ low_  : ulong @ +0x18
//     └─ m_myPlayer  (BnetPlayer)
//          └─ m_account  (BnetAccount)
//               └─ m_battleTag  (BnetBattleTag)
//                    ├─ m_name   : string @ +0x08
//                    └─ m_number : i32    @ +0x0C
pub const CLS_BNET_PRESENCE_MGR: (&str, &str) = ("", "BnetPresenceMgr");
pub const FLD_MY_BATTLENET_ACCOUNT_ID: &str = "m_myBattleNetAccountId";
pub const FLD_MY_PLAYER: &str = "m_myPlayer";
pub const FLD_MY_ACCOUNT: &str = "m_account";
pub const FLD_MY_BATTLE_TAG: &str = "m_battleTag";
pub const FLD_BATTLE_TAG_NAME: &str = "m_name";
pub const FLD_BATTLE_TAG_NUMBER: &str = "m_number";
pub const FLD_ENTITY_ID_BACKING: &str = "<EntityId>k__BackingField";
pub const FLD_ENTITY_HIGH: &str = "high_";
pub const FLD_ENTITY_LOW: &str = "low_";

// ── Legacy aliases (kept for `getMatchInfo` until that reflector is rewired)
//
// `match_info.rs` walks `GameMgr.s_instance.m_lastMatchInfo.{Local,Opposing}Player`
// where each player still embeds an older-shape `BattleTag` (m_name/m_string)
// and `AccountId` (m_hi/m_lo). Those classes are distinct from `BnetBattleTag`
// and `BnetAccountId` reached via `BnetPresenceMgr`. Keep these aliases until
// `getMatchInfo` is validated/refactored.
pub const FLD_BATTLE_TAG_STRING: &str = "m_string";
pub const FLD_ACCOUNT_HI: &str = "m_hi";
pub const FLD_ACCOUNT_LO: &str = "m_lo";

// ── getMedalInfo (NetCache → Map → NetCacheMedalInfo → Map → MedalInfoData) ──
//
// `NetCache.m_netCache` is `Blizzard.T5.Core.Map<System.Type, NetCacheValue>`
// (a custom hash map, NOT `System.Collections.Generic.Dictionary`). Iterate
// it via `collections::custom_map::iter_entries`, then look up the value
// whose runtime type is `NetCacheMedalInfo`.
//
// `NetCacheMedalInfo.MedalData` is **itself** another `Blizzard.T5.Core.Map`
// — keyed by `FormatType` (i32 enum value, see `FORMAT_TYPE_*` constants
// below) and valued by `PegasusUtil.MedalInfoData` (a protobuf-generated
// class — fields use `<Name>k__BackingField` and `_Name` underscore-prefixed
// conventions).
pub const FLD_NET_CACHE_MAP: &str = "m_netCache";
pub const CLS_NET_CACHE_MEDAL_INFO: &str = "NetCacheMedalInfo";
pub const FLD_NET_CACHE_MEDAL_DATA: &str = "MedalData";
pub const FLD_NET_CACHE_PREVIOUS_MEDAL: &str = "<PreviousMedalInfo>k__BackingField";

// MedalInfoData fields (protobuf-generated, verified live 2026-04-20).
pub const FLD_LEAGUE_ID: &str = "<LeagueId>k__BackingField";
pub const FLD_STAR_LEVEL: &str = "<StarLevel>k__BackingField";
pub const FLD_STARS: &str = "<Stars>k__BackingField";
pub const FLD_STREAK: &str = "<Streak>k__BackingField";
pub const FLD_SEASON_WINS: &str = "<SeasonWins>k__BackingField";
pub const FLD_LEGEND_RANK: &str = "_LegendRank";
pub const FLD_SEASON_ID: &str = "_SeasonId";
pub const FLD_BEST_STAR_LEVEL: &str = "_BestStarLevel";

// PegasusShared.FormatType enum values (canonical Hearthstone mapping).
pub const FORMAT_TYPE_UNKNOWN: u32 = 0;
pub const FORMAT_TYPE_WILD: u32 = 1;
pub const FORMAT_TYPE_STANDARD: u32 = 2;
pub const FORMAT_TYPE_CLASSIC: u32 = 3;
pub const FORMAT_TYPE_TWIST: u32 = 4;

// ── getMatchInfo fields ──────────────────────────────────────────────────────

pub const FLD_LAST_MATCH_INFO: &str = "m_lastMatchInfo";
pub const FLD_LOCAL_PLAYER: &str = "LocalPlayer";
pub const FLD_OPPOSING_PLAYER: &str = "OpposingPlayer";
pub const FLD_MISSION_ID: &str = "MissionId";
pub const FLD_GAME_TYPE: &str = "GameType";
pub const FLD_FORMAT_TYPE: &str = "FormatType";

// ── MatchPlayer sub-object fields ────────────────────────────────────────────

pub const FLD_PLAYER_ID: &str = "m_id";
pub const FLD_PLAYER_NAME: &str = "m_name";
pub const FLD_PLAYER_ACCOUNT_ID: &str = "m_accountId";
pub const FLD_PLAYER_BATTLE_TAG: &str = "m_battleTag";
pub const FLD_PLAYER_STANDARD_RANK: &str = "m_standardRank";
pub const FLD_PLAYER_WILD_RANK: &str = "m_wildRank";
pub const FLD_PLAYER_CLASSIC_RANK: &str = "m_classicRank";
pub const FLD_PLAYER_TWIST_RANK: &str = "m_twistRank";

// ── getGameType / isSpectating / isGameOver fields ───────────────────────────

pub const FLD_GAME_TYPE_FIELD: &str = "m_gameType";
pub const FLD_IS_SPECTATOR: &str = "m_isSpectator";
pub const FLD_GAME_OVER: &str = "m_gameOver";

// ── getDecks fields ──────────────────────────────────────────────────────────

pub const FLD_DECKS: &str = "m_decks";
pub const FLD_DECK_ID: &str = "m_id";
pub const FLD_DECK_NAME: &str = "m_name";
pub const FLD_DECK_HERO: &str = "HeroCardID";
pub const FLD_DECK_FORMAT_TYPE: &str = "m_formatType";
pub const FLD_DECK_TYPE: &str = "m_deckType";
pub const FLD_DECK_SLOTS: &str = "m_slots";

// ── CollectibleCard fields ───────────────────────────────────────────────────

pub const FLD_CARD_DBF_ID: &str = "m_CardDbId";
pub const FLD_CARD_COUNT: &str = "<OwnedCount>k__BackingField";
pub const FLD_CARD_PREMIUM: &str = "m_PremiumType";

// ── getCollection fields ─────────────────────────────────────────────────────

pub const FLD_COLLECTIBLE_CARDS: &str = "m_collectibleCards";

// ── getArenaDeck fields ──────────────────────────────────────────────────────

pub const FLD_CURRENT_DECK: &str = "m_currentDeck";
pub const FLD_WINS: &str = "m_wins";
pub const FLD_LOSSES: &str = "m_losses";

// ── getBattlegroundRatingInfo fields ─────────────────────────────────────────

pub const FLD_LAST_RATING_RESPONSE: &str = "m_lastRatingResponse";
pub const FLD_RATING: &str = "Rating";
pub const FLD_LEADERBOARD_PLACE: &str = "LeaderboardPlace";

// ── getServerInfo fields ─────────────────────────────────────────────────────

pub const FLD_CURRENT_SERVER_INFO: &str = "m_currentServerInfo";
pub const FLD_SERVER_ADDRESS: &str = "Address";
pub const FLD_SERVER_PORT: &str = "Port";
pub const FLD_SERVER_MISSION: &str = "Mission";
pub const FLD_SERVER_GAME_HANDLE: &str = "GameHandle";
pub const FLD_SERVER_VERSION: &str = "Version";
pub const FLD_SERVER_RESUMABLE: &str = "Resumable";

// ── In-match: GameState / Entity / EntityBase / TagMap / Player ──────────────
//
// Added by `add-hearthmirror-decks-and-in-match-readers` (Phase 7 readers).
// `GameState` exposes a real `s_instance` (Assembly-CSharp.dll), unlike
// NetCache which goes through ServiceLocator.
//
// `Entity` is the runtime in-match entity class held in
// `GameState.m_entityMap` (a `Blizzard.T5.Core.Map<int, Entity>`).
// `EntityBase` is the parent of both `Entity` and `EntityDef`
// (collection-side card definitions); the tag-dictionary fallback walks
// `Entity.<Tags>k__BackingField` first then `EntityBase.m_tags`.

pub const CLS_GAME_STATE_FOR_MATCH: (&str, &str) = ("", "GameState");
pub const FLD_ENTITY_MAP: &str = "m_entityMap";
pub const FLD_PLAYER_MAP: &str = "m_playerMap";
pub const FLD_CHOICES_MAP: &str = "m_choicesMap";

// Entity / EntityBase tag-reading chain.
pub const FLD_TAGS_BACKING: &str = "<Tags>k__BackingField";
pub const FLD_TAGS_LEGACY: &str = "m_tags";
pub const FLD_TAG_VALUES: &str = "m_values";
pub const FLD_CARD_ID_BACKING: &str = "<CardID>k__BackingField";
pub const FLD_CARD_ID_LEGACY: &str = "m_cardIdInternal";

// Entity m_realTime* fields used to render board / hand cards without
// re-reading their tag dictionaries (these mirror the relevant tag
// values into i32 instance fields for game-loop perf).
pub const FLD_REALTIME_ZONE: &str = "m_realTimeZone";
pub const FLD_REALTIME_ZONE_POS: &str = "m_realTimeZonePosition";
pub const FLD_REALTIME_ATTACK: &str = "m_realTimeAttack";
pub const FLD_REALTIME_HEALTH: &str = "m_realTimeHealth";
pub const FLD_REALTIME_DAMAGE: &str = "m_realTimeDamage";

// In-match Player object (held in GameState.m_playerMap).
pub const FLD_PLAYER_M_ID: &str = "m_id";
pub const FLD_PLAYER_M_NAME: &str = "m_name";
pub const FLD_PLAYER_M_LOCAL: &str = "m_local";
pub const FLD_PLAYER_M_SIDE: &str = "m_side";
pub const FLD_PLAYER_M_CARDBACK: &str = "m_cardback";

// Choices object fields (held in GameState.m_choicesMap values).
pub const FLD_CHOICE_TYPE: &str = "<ChoiceType>k__BackingField";
pub const FLD_CHOICE_COUNT_MIN: &str = "<CountMin>k__BackingField";
pub const FLD_CHOICE_COUNT_MAX: &str = "<CountMax>k__BackingField";
pub const FLD_CHOICE_SOURCE: &str = "<Source>k__BackingField";
pub const FLD_CHOICE_ENTITIES: &str = "<Entities>k__BackingField";

// MulliganManager (Assembly-CSharp.dll, has real s_instance).
pub const CLS_MULLIGAN_MGR: (&str, &str) = ("", "MulliganManager");
pub const FLD_MULLIGAN_BANNER: &str = "mulliganChooseBanner";

// DeckPickerTrayDisplay — the in-game Play-menu deck-picker UI singleton.
// Used by `getSelectedDeckId` to identify the deck the user is queueing.
// Class is only loaded when the user is on the Play screen; reflector
// returns null in any other scene (which is the correct degraded state).
pub const CLS_DECK_PICKER_TRAY: (&str, &str) = ("", "DeckPickerTrayDisplay");
pub const FLD_VISUALS_FORMAT_TYPE: &str = "m_visualsFormatType";
pub const FLD_SELECTED_CUSTOM_DECK_BOX: &str = "m_selectedCustomDeckBox";
pub const FLD_DECK_BOX_DECK_ID: &str = "m_deckID";
pub const FLD_DECK_BOX_TEMPLATE_ID: &str = "m_deckTemplateId";

// CollectionDeck / CollectionDeckSlot — replaces the Phase-1 stub
// constants below. CollectionDeck is held in
// `CollectionManager.m_decks` (a `Blizzard.T5.Core.Map<long, CollectionDeck>`).
pub const FLD_COLLECTION_DECK_ID: &str = "ID";
pub const FLD_COLLECTION_DECK_NAME: &str = "m_name";
pub const FLD_COLLECTION_DECK_HERO: &str = "<HeroCardID>k__BackingField";
pub const FLD_COLLECTION_DECK_FORMAT: &str = "<FormatType>k__BackingField";
pub const FLD_COLLECTION_DECK_TYPE: &str = "<Type>k__BackingField";
pub const FLD_COLLECTION_DECK_SEASON: &str = "SeasonId";
pub const FLD_COLLECTION_DECK_CARDBACK: &str = "CardBackID";
pub const FLD_COLLECTION_DECK_CREATE_DATE: &str = "CreateDate";
pub const FLD_COLLECTION_DECK_SLOTS: &str = "m_slots";
pub const FLD_DECK_SLOT_CARD_ID: &str = "m_cardId";
pub const FLD_DECK_SLOT_COUNT: &str = "m_count";
pub const FLD_EDITED_DECK: &str = "m_EditedDeck";

// Network service value-type struct chain (in-process for getServerInfo).
pub const SVC_NETWORK: &str = "Network";
pub const SVC_GAME_MGR: &str = "GameMgr";
pub const FLD_NETWORK_M_STATE: &str = "m_state";
pub const CLS_NETWORK_STATE_NESTED: &str = "Network+NetworkState";
pub const CLS_NETWORK_STATE_BARE: &str = "NetworkState";
pub const FLD_LAST_GAME_SERVER_INFO: &str = "<LastGameServerInfo>k__BackingField";
pub const FLD_GS_ADDRESS: &str = "<Address>k__BackingField";
pub const FLD_GS_PORT: &str = "<Port>k__BackingField";
pub const FLD_GS_GAME_HANDLE: &str = "<GameHandle>k__BackingField";
pub const FLD_GS_CLIENT_HANDLE: &str = "<ClientHandle>k__BackingField";
pub const FLD_GS_VERSION: &str = "<Version>k__BackingField";
pub const FLD_GS_SPECTATOR_MODE: &str = "<SpectatorMode>k__BackingField";
pub const FLD_GS_MISSION: &str = "<Mission>k__BackingField";
pub const FLD_GS_SPECTATOR_PASSWORD: &str = "<SpectatorPassword>k__BackingField";
pub const FLD_GS_AURORA_PASSWORD: &str = "<AuroraPassword>k__BackingField";

// GameMgr fields (held by ServiceLocator service, NOT singleton).
pub const FLD_GAMEMGR_M_GAME_TYPE: &str = "m_gameType";
pub const FLD_GAMEMGR_M_FORMAT_TYPE: &str = "m_formatType";
pub const FLD_GAMEMGR_M_MISSION_ID: &str = "m_missionId";

// ── Mono structure offsets ───────────────────────────────────────────────────
//
// REMOVED 2026-04-20 by `add-hearthmirror-offset-probing` Phase 5.5: the 13
// hardcoded `MONO_IMAGE_*` / `MONO_CLASS_*` / `MONO_CLASS_FIELD_*` constants
// previously here have been deleted. All Mono runtime struct offsets are now
// loaded from `crate::mono::offsets::MonoOffsets` (JSON baseline +
// `OffsetProber` refinement). Access via `runtime.offsets.structs.<type>.<field>`
// or, from a `MonoClassRef` / `MonoObject`, `self.offsets.structs.*`.
//
// See `openspec/changes/add-hearthmirror-offset-probing/design.md` "Phase 5.5
// Audit" for the rationale (11/13 offsets in the old table were wrong, plus a
// P0 NAME/TYPE swap latent bug fixed in the same phase).
