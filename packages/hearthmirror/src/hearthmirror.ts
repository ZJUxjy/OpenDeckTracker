import * as native from '@hdt/hearthmirror-native';
import { MirrorError, MirrorErrorCode } from './errors';
import type {
  AccountId,
  ArenaInfo,
  BattleTag,
  BattlegroundRatingInfo,
  BoardEntity,
  BoardState,
  ChoiceCard,
  ChoiceGroup,
  Choices,
  CollectionCard,
  Deck,
  DeckCard,
  DeckState,
  GameServerInfo,
  GameType,
  HandCard,
  HandState,
  InMatchDeckCard,
  IsMulligan,
  MatchInfo,
  MatchPlayer,
  MedalInfo,
  MedalInfoData,
  OpponentSecrets,
  SecretEntity,
  SelectedDeck,
} from './types';

/**
 * Promote i64 (which `napi-rs` exposes as a `number` capped at 2^53)
 * to bigint without losing precision. BNet ids and game handles
 * routinely exceed the safe-integer range.
 */
function toBigInt(n: number | bigint): bigint {
  return typeof n === 'bigint' ? n : BigInt(n);
}

/** Thin wrapper around the napi-rs facade with TS-idiomatic shapes. */
export class HearthMirror {
  private _connected = false;

  get isConnected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    const alive = await native.isAlive();
    this._connected = alive;
  }

  disconnect(): void {
    this._connected = false;
  }

  async isAlive(): Promise<boolean> {
    const alive = await native.isAlive();
    this._connected = alive;
    return alive;
  }

  async getBattleTag(): Promise<BattleTag | null> {
    const r = await native.getBattleTag();
    if (!r) return null;
    return { name: r.name, fullBattleTag: r.fullBattleTag };
  }

  async getAccountId(): Promise<AccountId | null> {
    const r = await native.getAccountId();
    if (!r) return null;
    return { hi: toBigInt(r.hi), lo: toBigInt(r.lo) };
  }

  async getGameType(): Promise<GameType | null> {
    const r = await native.getGameType();
    if (!r) return null;
    return {
      gameType: r.gameType ?? null,
      formatType: r.formatType ?? null,
      missionId: r.missionId ?? null,
    };
  }

  async isSpectating(): Promise<boolean> {
    return native.isSpectating();
  }

  async isGameOver(): Promise<boolean> {
    return native.isGameOver();
  }

  async isMulligan(): Promise<IsMulligan> {
    const r = await native.isMulligan();
    return { mulligan: r.mulligan ?? null };
  }

  async getMatchInfo(): Promise<MatchInfo | null> {
    const r = await native.getMatchInfo();
    if (!r) return null;
    const toPlayer = (p: typeof r.localPlayer): MatchPlayer | null =>
      p
        ? {
            id: p.id,
            name: p.name,
            side: p.side,
            standardRank: p.standardRank,
            standardLegendRank: p.standardLegendRank,
            wildRank: p.wildRank,
            wildLegendRank: p.wildLegendRank,
            classicRank: p.classicRank,
            classicLegendRank: p.classicLegendRank,
            twistRank: p.twistRank,
            twistLegendRank: p.twistLegendRank,
            cardbackId: p.cardbackId,
          }
        : null;
    return {
      localPlayer: toPlayer(r.localPlayer),
      opposingPlayer: toPlayer(r.opposingPlayer),
      missionId: r.missionId,
      gameType: r.gameType,
      formatType: r.formatType,
      rankedSeasonId: r.rankedSeasonId,
      arenaSeasonId: r.arenaSeasonId,
      brawlSeasonId: r.brawlSeasonId,
    };
  }

  async getMedalInfo(): Promise<MedalInfo | null> {
    const r = await native.getMedalInfo();
    if (!r) return null;
    const toData = (d: typeof r.standard | undefined | null): MedalInfoData | null =>
      d
        ? {
            leagueId: d.leagueId,
            starLevel: d.starLevel,
            stars: d.stars,
            streak: d.streak,
            legendRank: d.legendRank,
            seasonId: d.seasonId,
            seasonWins: d.seasonWins,
            bestStarLevel: d.bestStarLevel,
          }
        : null;
    return {
      standard: toData(r.standard),
      wild: toData(r.wild),
      classic: toData(r.classic),
      twist: toData(r.twist),
    };
  }

  async getDecks(): Promise<Deck[] | null> {
    const r = await native.getDecks();
    if (!r) return null;
    return r.map(mapDeck);
  }

  async getEditedDeck(): Promise<Deck | null> {
    const r = await native.getEditedDeck();
    if (!r) return null;
    return mapDeck(r);
  }

  async getCollection(): Promise<CollectionCard[] | null> {
    const r = await native.getCollection();
    if (!r) return null;
    return r.map((c) => ({ dbfId: c.dbfId, count: c.count, premium: c.premium }));
  }

  async getArenaDeck(): Promise<ArenaInfo | null> {
    const r = await native.getArenaDeck();
    if (!r) return null;
    return {
      deck: mapDeck(r.deck),
      wins: r.wins,
      losses: r.losses,
    };
  }

  async getBattlegroundRatingInfo(): Promise<BattlegroundRatingInfo | null> {
    const r = await native.getBattlegroundRatingInfo();
    if (!r) return null;
    return { rating: r.rating, rank: r.rank };
  }

  async getServerInfo(): Promise<GameServerInfo | null> {
    const r = await native.getServerInfo();
    if (!r) return null;
    return {
      address: r.address,
      port: r.port,
      gameHandle: r.gameHandle,
      clientHandle: toBigInt(r.clientHandle),
      version: r.version,
      spectatorMode: r.spectatorMode,
      mission: r.mission,
      spectatorPassword: r.spectatorPassword,
      auroraPassword: r.auroraPassword,
    };
  }

  // ── Phase 7: in-match observability ─────────────────────────────────

  async getBoardState(): Promise<BoardState | null> {
    const r = await native.getBoardState();
    if (!r) return null;
    const toEntity = (e: typeof r.friendly[number]): BoardEntity => ({
      entityId: e.entityId,
      cardId: e.cardId,
      zonePosition: e.zonePosition,
      attack: e.attack,
      health: e.health,
      damage: e.damage,
    });
    return {
      friendly: r.friendly.map(toEntity),
      opposing: r.opposing.map(toEntity),
    };
  }

  async getHandState(): Promise<HandState | null> {
    const r = await native.getHandState();
    if (!r) return null;
    const toCard = (c: typeof r.friendlyHand[number]): HandCard => ({
      entityId: c.entityId,
      cardId: c.cardId,
      zonePosition: c.zonePosition,
    });
    return {
      friendlyHand: r.friendlyHand.map(toCard),
      opposingHandCount: r.opposingHandCount,
    };
  }

  async getDeckState(): Promise<DeckState | null> {
    const r = await native.getDeckState();
    if (!r) return null;
    const toCard = (c: typeof r.friendlyDeck[number]): InMatchDeckCard => ({
      entityId: c.entityId,
      cardId: c.cardId,
    });
    return {
      friendlyDeck: r.friendlyDeck.map(toCard),
      opposingDeckCount: r.opposingDeckCount,
    };
  }

  async getOpponentSecrets(): Promise<OpponentSecrets | null> {
    const r = await native.getOpponentSecrets();
    if (!r) return null;
    const toSecret = (s: typeof r.secrets[number]): SecretEntity => ({
      entityId: s.entityId,
      cardId: s.cardId,
      zonePosition: s.zonePosition,
    });
    return {
      secrets: r.secrets.map(toSecret),
      count: r.count,
    };
  }

  async getSelectedDeckId(): Promise<SelectedDeck | null> {
    const r = await native.getSelectedDeckId();
    if (!r) return null;
    return {
      deckId: toBigInt(r.deckId),
      templateDeckId: r.templateDeckId,
      formatType: r.formatType,
    };
  }

  async getChoices(): Promise<Choices | null> {
    const r = await native.getChoices();
    if (!r) return null;
    const toGroup = (g: ChoiceGroupRaw | undefined | null): ChoiceGroup | null =>
      g
        ? {
            sourceEntityId: g.sourceEntityId,
            countMin: g.countMin,
            countMax: g.countMax,
            cards: g.cards.map((c): ChoiceCard => ({
              entityId: c.entityId,
              cardId: c.cardId,
            })),
          }
        : null;
    return {
      mulligan: toGroup(r.mulligan),
      general: toGroup(r.general),
    };
  }
}

// Local helper type — narrows the generic napi result to a usable shape
// for the toGroup mapping helper above.
type ChoiceGroupRaw = {
  sourceEntityId: number;
  countMin: number;
  countMax: number;
  cards: { entityId: number; cardId: string }[];
};

/**
 * Shared mapping helper for napi `DeckResult` → public `Deck`. Used by
 * both `getDecks` (each entry) and `getEditedDeck` / `getArenaDeck.deck`.
 */
function mapDeck(d: native.DeckResult): Deck {
  return {
    id: Number(d.id),
    name: d.name,
    hero: d.hero,
    formatType: d.formatType,
    deckType: d.deckType,
    seasonId: d.seasonId,
    cardbackId: d.cardbackId,
    createDateMicrosec: Number(d.createDateMicrosec),
    cards: d.cards.map((c): DeckCard => ({
      cardId: c.cardId,
      count: c.count,
      premium: c.premium,
    })),
  };
}

export { MirrorError, MirrorErrorCode };
