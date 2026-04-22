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

// ── DeckCardData fields ──────────────────────────────────────────────────────

pub const FLD_CARD_DBF_ID: &str = "DbfId";
pub const FLD_CARD_COUNT: &str = "m_count";
pub const FLD_CARD_PREMIUM: &str = "m_premium";

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
