//! Centralized field path string constants for all 12 IReflection methods.
//!
//! All field names that appear in Hearthstone's C# classes are collected here
//! to keep them in one place and make version-drift maintenance easier.
//! See `docs/superpowers/research/2026-04-20-hearthmirror-field-paths.md` for
//! the full chain documentation.

// ── Singleton class names (namespace, name) ──────────────────────────────────

pub const CLS_NET_CACHE: (&str, &str) = ("", "NetCache");
pub const CLS_GAME_STATE: (&str, &str) = ("", "GameState");
pub const CLS_GAME_MGR: (&str, &str) = ("", "GameMgr");
pub const CLS_COLLECTION_MANAGER: (&str, &str) = ("", "CollectionManager");
pub const CLS_DRAFT_MANAGER: (&str, &str) = ("", "DraftManager");
pub const CLS_BACON_RATING_MGR: (&str, &str) = ("", "BaconRatingMgr");
pub const CLS_NETWORK: (&str, &str) = ("", "Network");

// ── Common field names ───────────────────────────────────────────────────────

pub const FLD_S_INSTANCE: &str = "s_instance";

// ── getBattleTag fields ──────────────────────────────────────────────────────

pub const FLD_NET_CACHE_VALUES: &str = "m_netCacheValues";
pub const FLD_BATTLE_TAG: &str = "BattleTag";
pub const FLD_BATTLE_TAG_NAME: &str = "m_name";
pub const FLD_BATTLE_TAG_STRING: &str = "m_string";

// ── getAccountId fields ──────────────────────────────────────────────────────

pub const FLD_ACCOUNT_ID: &str = "m_accountId";
pub const FLD_ACCOUNT_HI: &str = "m_hi";
pub const FLD_ACCOUNT_LO: &str = "m_lo";

// ── getMedalInfo fields ──────────────────────────────────────────────────────

pub const FLD_STANDARD: &str = "Standard";
pub const FLD_WILD: &str = "Wild";
pub const FLD_CLASSIC: &str = "Classic";
pub const FLD_TWIST: &str = "Twist";
pub const FLD_LEAGUE_ID: &str = "LeagueId";
pub const FLD_STAR_LEVEL: &str = "StarLevel";
pub const FLD_STARS: &str = "Stars";
pub const FLD_LEGEND_RANK: &str = "LegendRank";
pub const FLD_SEASON_ID: &str = "SeasonId";
pub const FLD_SEASON_WINS: &str = "SeasonWins";

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
