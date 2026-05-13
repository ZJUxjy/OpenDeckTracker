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
  CollectionDiagnostic,
  Deck,
  DeckCard,
  DeckState,
  GameServerInfo,
  GameType,
  HandCard,
  HandState,
  HearthstoneWindow,
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

const CP437_EXTENDED_CHARS = [
  '\u00c7', '\u00fc', '\u00e9', '\u00e2', '\u00e4', '\u00e0', '\u00e5', '\u00e7',
  '\u00ea', '\u00eb', '\u00e8', '\u00ef', '\u00ee', '\u00ec', '\u00c4', '\u00c5',
  '\u00c9', '\u00e6', '\u00c6', '\u00f4', '\u00f6', '\u00f2', '\u00fb', '\u00f9',
  '\u00ff', '\u00d6', '\u00dc', '\u00a2', '\u00a3', '\u00a5', '\u20a7', '\u0192',
  '\u00e1', '\u00ed', '\u00f3', '\u00fa', '\u00f1', '\u00d1', '\u00aa', '\u00ba',
  '\u00bf', '\u2310', '\u00ac', '\u00bd', '\u00bc', '\u00a1', '\u00ab', '\u00bb',
  '\u2591', '\u2592', '\u2593', '\u2502', '\u2524', '\u2561', '\u2562', '\u2556',
  '\u2555', '\u2563', '\u2551', '\u2557', '\u255d', '\u255c', '\u255b', '\u2510',
  '\u2514', '\u2534', '\u252c', '\u251c', '\u2500', '\u253c', '\u255e', '\u255f',
  '\u255a', '\u2554', '\u2569', '\u2566', '\u2560', '\u2550', '\u256c', '\u2567',
  '\u2568', '\u2564', '\u2565', '\u2559', '\u2558', '\u2552', '\u2553', '\u256b',
  '\u256a', '\u2518', '\u250c', '\u2588', '\u2584', '\u258c', '\u2590', '\u2580',
  '\u03b1', '\u00df', '\u0393', '\u03c0', '\u03a3', '\u03c3', '\u00b5', '\u03c4',
  '\u03a6', '\u0398', '\u03a9', '\u03b4', '\u221e', '\u03c6', '\u03b5', '\u2229',
  '\u2261', '\u00b1', '\u2265', '\u2264', '\u2320', '\u2321', '\u00f7', '\u2248',
  '\u00b0', '\u2219', '\u00b7', '\u221a', '\u207f', '\u00b2', '\u25a0', '\u00a0',
] as const;

const CP437_BYTE_BY_CHAR = new Map<string, number>(
  CP437_EXTENDED_CHARS.map((char, index) => [char, 0x80 + index]),
);

const UTF8_DECODER = new TextDecoder('utf-8');

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

  /**
   * Locate the Hearthstone window and read its bounds + visibility flags.
   * Resolves to `null` when no window is found or when the native call
   * throws — callers can't distinguish those two cases (and shouldn't need to).
   */
  async getHearthstoneWindow(): Promise<HearthstoneWindow | null> {
    try {
      const r = await native.getHearthstoneWindow();
      if (!r) return null;
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        minimized: r.minimized,
        visible: r.visible,
      };
    } catch {
      return null;
    }
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
    if (!r) return { mulligan: null };
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

  /**
   * Diagnostic-only sibling of {@link getCollection}. Performs a fresh
   * walk of `m_collectibleCards` and returns structured counters
   * describing how the walk went (list size, per-element parse
   * results, sampled element class). Used to debug why `getCollection`
   * returns the data it does without having to scrape the
   * `[hearthmirror:collection]` eprintln line out of stderr.
   *
   * Returns `null` only when the native fn itself resolves to a
   * falsy value (i.e. the runtime is truly unavailable and the
   * `with_runtime_or` default short-circuit fired with no struct).
   * The happy path always returns a struct, even when every counter
   * is 0 (e.g. the CollectionManager singleton isn't initialized).
   */
  async getCollectionDiagnostic(): Promise<CollectionDiagnostic | null> {
    const r = await native.getCollectionDiagnostic();
    if (!r) return null;
    return {
      listSize: r.listSize,
      parsed: r.parsed,
      nonZeroDbfid: r.nonZeroDbfid,
      nullPtrs: r.nullPtrs,
      fieldMisses: r.fieldMisses,
      sampleClass: r.sampleClass ?? null,
      elapsedMs: r.elapsedMs,
    };
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
    name: repairCp437Utf8Mojibake(d.name),
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

function repairCp437Utf8Mojibake(value: string): string {
  if (!/[^\x00-\x7f]/.test(value)) return value;

  const bytes: number[] = [];
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x7f) {
      bytes.push(code);
      continue;
    }
    const byte = CP437_BYTE_BY_CHAR.get(char);
    if (byte === undefined) return value;
    bytes.push(byte);
  }

  const decoded = UTF8_DECODER.decode(Uint8Array.from(bytes));
  return readabilityScore(decoded) > readabilityScore(value) ? decoded : value;
}

function readabilityScore(value: string): number {
  let score = 0;
  for (const char of value) {
    if (/[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff]/u.test(char)) {
      score += 2;
    }
    if (/[\u0370-\u03ff\u2500-\u257f]/u.test(char)) {
      score -= 1;
    }
    if (char === '\ufffd') {
      score -= 2;
    }
  }
  return score;
}

export { MirrorError, MirrorErrorCode };
