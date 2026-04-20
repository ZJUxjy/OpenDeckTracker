import * as native from '@hdt/hearthmirror-native';
import { MirrorError, MirrorErrorCode } from './errors';
import type {
  AccountId,
  ArenaInfo,
  BattleTag,
  BattlegroundRatingInfo,
  Card,
  Deck,
  FieldDump,
  GameServerInfo,
  MatchInfo,
  MatchPlayer,
  MedalInfo,
  MedalInfoData,
  ServiceInfo,
} from './types';

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
    return { hi: BigInt(r.hi), lo: BigInt(r.lo) };
  }

  async getGameType(): Promise<number> {
    return native.getGameType();
  }

  async isSpectating(): Promise<boolean> {
    return native.isSpectating();
  }

  async isGameOver(): Promise<boolean> {
    return native.isGameOver();
  }

  async isMulligan(): Promise<boolean> {
    return (await native.isMulligan()) ?? false;
  }

  async dumpClass(className: string, limit?: number): Promise<FieldDump[]> {
    return native.dumpClass(className, limit);
  }

  async listServices(): Promise<ServiceInfo[]> {
    return native.listServices();
  }

  async getMatchInfo(): Promise<MatchInfo | null> {
    const r = await native.getMatchInfo();
    if (!r) return null;
    const toPlayer = (p: typeof r.localPlayer): MatchPlayer => ({
      id: p.id,
      name: p.name,
      accountId: { hi: BigInt(p.accountIdHi), lo: BigInt(p.accountIdLo) },
      battleTag: { name: p.battleTagName, fullBattleTag: p.battleTagFull },
      standardRank: p.standardRank,
      wildRank: p.wildRank,
      classicRank: p.classicRank,
      twistRank: p.twistRank,
    });
    return {
      localPlayer: toPlayer(r.localPlayer),
      opposingPlayer: toPlayer(r.opposingPlayer),
      missionId: r.missionId,
      gameType: r.gameType,
      formatType: r.formatType,
    };
  }

  async getMedalInfo(): Promise<MedalInfo | null> {
    const r = await native.getMedalInfo();
    if (!r) return null;
    const toData = (d: typeof r.standard | null | undefined): MedalInfoData | null =>
      d
        ? {
            leagueId: d.leagueId,
            starLevel: d.starLevel,
            stars: d.stars,
            legendRank: d.legendRank,
            seasonId: d.seasonId,
            seasonWins: d.seasonWins,
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
    return r.map((d) => ({
      id: Number(d.id),
      name: d.name,
      hero: d.hero,
      formatType: d.formatType,
      deckType: d.deckType,
      cards: d.cards.map((c) => ({ dbfId: c.dbfId, count: c.count, premium: c.premium })),
    }));
  }

  async getCollection(): Promise<Card[] | null> {
    const r = await native.getCollection();
    if (!r) return null;
    return r.map((c) => ({ dbfId: c.dbfId, count: c.count, premium: c.premium }));
  }

  async getArenaDeck(): Promise<ArenaInfo | null> {
    const r = await native.getArenaDeck();
    if (!r) return null;
    return {
      deck: {
        id: Number(r.deck.id),
        name: r.deck.name,
        hero: r.deck.hero,
        formatType: r.deck.formatType,
        deckType: r.deck.deckType,
        cards: r.deck.cards.map((c) => ({ dbfId: c.dbfId, count: c.count, premium: c.premium })),
      },
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
      mission: r.mission,
      gameHandle: r.gameHandle,
      version: r.version,
      resumable: r.resumable,
    };
  }
}

export { MirrorError, MirrorErrorCode };
