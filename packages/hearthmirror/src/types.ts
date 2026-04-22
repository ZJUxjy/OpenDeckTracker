// Mirrors `packages/hearthmirror/native/index.d.ts` shapes (auto-generated
// by napi-rs from the Rust reflectors). Adds JS-side conveniences:
//   - AccountId hi/lo as bigint (Rust returns them as i64; we widen to
//     bigint in the facade because >2^53 values are common in BNet ids).
//   - DeckCard is named `Card` in our public API for back-compat with
//     downstream renderer code; CollectionCard kept as `CollectionCard`
//     to disambiguate.

export interface BattleTag {
  name: string;
  fullBattleTag: string;
}

export interface AccountId {
  hi: bigint;
  lo: bigint;
}

/** A card in the user's collection (dbf-id keyed; from `getCollection`). */
export interface CollectionCard {
  dbfId: number;
  count: number;
  premium: number;
}

/** A card slot inside a saved CollectionDeck (string cardId, from `getDecks`). */
export interface DeckCard {
  cardId: string;
  count: number;
  premium: number;
}

export interface Deck {
  id: number;
  name: string;
  hero: string;
  formatType: number;
  deckType: number;
  seasonId: number;
  cardbackId: number;
  createDateMicrosec: number;
  cards: DeckCard[];
}

export interface MatchPlayer {
  /** In-match player id (== TAG_CONTROLLER value); 0 in some PvE modes. */
  id: number;
  /** Display name (BattleTag for human, AI name for vs-AI). */
  name: string;
  /** `Player.m_side` — 1=friendly, 2=opposing per Hearthstone protocol. */
  side: number;
  standardRank: number;
  standardLegendRank: number;
  wildRank: number;
  wildLegendRank: number;
  classicRank: number;
  classicLegendRank: number;
  twistRank: number;
  twistLegendRank: number;
  /** Cardback id (PegasusUtil.NetCacheCardBacks). */
  cardbackId: number;
}

export interface MatchInfo {
  localPlayer: MatchPlayer | null;
  opposingPlayer: MatchPlayer | null;
  missionId: number;
  gameType: number;
  formatType: number;
  /** Reserved season-id slots — populated by a follow-up MedalInfo wiring. */
  rankedSeasonId: number;
  arenaSeasonId: number;
  brawlSeasonId: number;
}

export interface MedalInfoData {
  leagueId: number;
  starLevel: number;
  stars: number;
  /** Win-streak count; new in Phase 5+7. */
  streak: number;
  legendRank: number;
  seasonId: number;
  seasonWins: number;
  /** Highest StarLevel ever reached on this ladder; new in Phase 5+7. */
  bestStarLevel: number;
}

export interface MedalInfo {
  standard: MedalInfoData | null;
  wild: MedalInfoData | null;
  classic: MedalInfoData | null;
  twist: MedalInfoData | null;
}

export interface ArenaInfo {
  deck: Deck;
  wins: number;
  losses: number;
}

export interface BattlegroundRatingInfo {
  rating: number;
  rank: number;
}

export interface GameServerInfo {
  address: string;
  port: number;
  gameHandle: number;
  /** i64 from Rust; widened to bigint to avoid precision loss. */
  clientHandle: bigint;
  version: string;
  spectatorMode: boolean;
  mission: number;
  spectatorPassword: string;
  auroraPassword: string;
}

export interface GameType {
  /** `PegasusShared.GameType` enum, null when GameMgr unregistered (early startup). */
  gameType: number | null;
  /** `PegasusShared.FormatType` enum (1=Wild, 2=Standard, 3=Classic, 4=Twist). */
  formatType: number | null;
  /** Mission/scenario id; null when not in a mission. */
  missionId: number | null;
}

// ── Phase 7: in-match observability ───────────────────────────────────

export interface BoardEntity {
  entityId: number;
  cardId: string;
  zonePosition: number;
  attack: number;
  health: number;
  damage: number;
}

export interface BoardState {
  friendly: BoardEntity[];
  opposing: BoardEntity[];
}

export interface HandCard {
  entityId: number;
  cardId: string;
  zonePosition: number;
}

export interface HandState {
  friendlyHand: HandCard[];
  /** Count only; opposing hand cardIds are intentionally not exposed. */
  opposingHandCount: number;
}

export interface InMatchDeckCard {
  entityId: number;
  cardId: string;
}

export interface DeckState {
  /** Friendly remaining deck (entity_id + card_id; cardId may be empty for face-down). */
  friendlyDeck: InMatchDeckCard[];
  opposingDeckCount: number;
}

export interface SecretEntity {
  entityId: number;
  cardId: string;
  zonePosition: number;
}

export interface OpponentSecrets {
  secrets: SecretEntity[];
  count: number;
}

export interface ChoiceCard {
  entityId: number;
  cardId: string;
}

export interface ChoiceGroup {
  sourceEntityId: number;
  countMin: number;
  countMax: number;
  cards: ChoiceCard[];
}

export interface Choices {
  /** Mulligan choice group, present during the mulligan phase. */
  mulligan: ChoiceGroup | null;
  /** General choice group (e.g. Discover effects). */
  general: ChoiceGroup | null;
}

export interface IsMulligan {
  /**
   * `true` when the mulligan banner is active, `false` when it isn't,
   * `null` when MulliganManager is uninitialised (typical pre-match).
   */
  mulligan: boolean | null;
}
