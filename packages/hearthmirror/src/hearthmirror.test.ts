import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@hdt/hearthmirror-native', () => ({
  isAlive: vi.fn(),
  getBattleTag: vi.fn(),
  getAccountId: vi.fn(),
  getGameType: vi.fn(),
  isSpectating: vi.fn(),
  isGameOver: vi.fn(),
  isMulligan: vi.fn(),
  getMatchInfo: vi.fn(),
  getMedalInfo: vi.fn(),
  getDecks: vi.fn(),
  getEditedDeck: vi.fn(),
  getCollection: vi.fn(),
  getArenaDeck: vi.fn(),
  getBattlegroundRatingInfo: vi.fn(),
  getServerInfo: vi.fn(),
  getBoardState: vi.fn(),
  getHandState: vi.fn(),
  getDeckState: vi.fn(),
  getOpponentSecrets: vi.fn(),
  getChoices: vi.fn(),
}));

import * as native from '@hdt/hearthmirror-native';
import { HearthMirror } from './hearthmirror';

const mocked = vi.mocked;

/** Minimal MatchPlayerResult fixture with all the required new fields. */
const makeNativePlayer = (overrides: Partial<native.MatchPlayerResult> = {}): native.MatchPlayerResult => ({
  id: 1,
  name: 'Bob',
  side: 1,
  standardRank: 5,
  standardLegendRank: 0,
  wildRank: 3,
  wildLegendRank: 0,
  classicRank: 1,
  classicLegendRank: 0,
  twistRank: 0,
  twistLegendRank: 0,
  cardbackId: 0,
  ...overrides,
});

const makeNativeDeck = (overrides: Partial<native.DeckResult> = {}): native.DeckResult => ({
  id: 999,
  name: 'Aggro',
  hero: 'HERO_01',
  formatType: 2,
  deckType: 1,
  seasonId: 150,
  cardbackId: 0,
  createDateMicrosec: 0,
  cards: [{ cardId: 'CS2_222', count: 2, premium: 0 }],
  ...overrides,
});

describe('HearthMirror', () => {
  let mirror: HearthMirror;

  beforeEach(() => {
    mirror = new HearthMirror();
    vi.clearAllMocks();
  });

  describe('isAlive', () => {
    it('returns true and sets isConnected', async () => {
      mocked(native.isAlive).mockResolvedValue(true);
      expect(await mirror.isAlive()).toBe(true);
      expect(mirror.isConnected).toBe(true);
    });

    it('returns false and clears isConnected', async () => {
      mocked(native.isAlive).mockResolvedValue(false);
      expect(await mirror.isAlive()).toBe(false);
      expect(mirror.isConnected).toBe(false);
    });
  });

  describe('getAccountId', () => {
    it('converts number fields to BigInt', async () => {
      mocked(native.getAccountId).mockResolvedValue({ hi: 12345, lo: 67890 });
      const result = await mirror.getAccountId();
      expect(result).toEqual({ hi: 12345n, lo: 67890n });
    });

    it('returns null when native returns null', async () => {
      mocked(native.getAccountId).mockResolvedValue(null);
      expect(await mirror.getAccountId()).toBeNull();
    });
  });

  describe('getBattleTag', () => {
    it('passes through name and fullBattleTag', async () => {
      mocked(native.getBattleTag).mockResolvedValue({ name: 'Alice', fullBattleTag: 'Alice#1234' });
      const result = await mirror.getBattleTag();
      expect(result).toEqual({ name: 'Alice', fullBattleTag: 'Alice#1234' });
    });

    it('returns null when native returns null', async () => {
      mocked(native.getBattleTag).mockResolvedValue(null);
      expect(await mirror.getBattleTag()).toBeNull();
    });
  });

  describe('getGameType', () => {
    it('maps optional fields to nullable', async () => {
      mocked(native.getGameType).mockResolvedValue({
        gameType: 1,
        formatType: 2,
        missionId: 270,
      });
      const result = await mirror.getGameType();
      expect(result).toEqual({ gameType: 1, formatType: 2, missionId: 270 });
    });

    it('coerces missing fields to null (not undefined)', async () => {
      mocked(native.getGameType).mockResolvedValue({});
      const result = await mirror.getGameType();
      expect(result).toEqual({ gameType: null, formatType: null, missionId: null });
    });

    it('returns null when native returns null', async () => {
      mocked(native.getGameType).mockResolvedValue(null);
      expect(await mirror.getGameType()).toBeNull();
    });
  });

  describe('isMulligan', () => {
    it('coerces null → null', async () => {
      mocked(native.isMulligan).mockResolvedValue(null);
      expect(await mirror.isMulligan()).toEqual({ mulligan: null });
    });

    it('coerces undefined → null', async () => {
      mocked(native.isMulligan).mockResolvedValue({});
      expect(await mirror.isMulligan()).toEqual({ mulligan: null });
    });

    it('passes through boolean', async () => {
      mocked(native.isMulligan).mockResolvedValue({ mulligan: true });
      expect(await mirror.isMulligan()).toEqual({ mulligan: true });
    });
  });

  describe('getMatchInfo', () => {
    it('maps both player slots and reserved season ids', async () => {
      mocked(native.getMatchInfo).mockResolvedValue({
        localPlayer: makeNativePlayer({ id: 1, side: 1, name: 'Local' }),
        opposingPlayer: makeNativePlayer({ id: 2, side: 2, name: 'Opp' }),
        missionId: 270,
        gameType: 1,
        formatType: 1,
        rankedSeasonId: 0,
        arenaSeasonId: 0,
        brawlSeasonId: 0,
      });
      const result = await mirror.getMatchInfo();
      expect(result).not.toBeNull();
      expect(result!.localPlayer?.name).toBe('Local');
      expect(result!.localPlayer?.side).toBe(1);
      expect(result!.opposingPlayer?.side).toBe(2);
      expect(result!.missionId).toBe(270);
    });

    it('coerces missing player slots to null', async () => {
      mocked(native.getMatchInfo).mockResolvedValue({
        missionId: 0,
        gameType: 0,
        formatType: 0,
        rankedSeasonId: 0,
        arenaSeasonId: 0,
        brawlSeasonId: 0,
      });
      const result = await mirror.getMatchInfo();
      expect(result).not.toBeNull();
      expect(result!.localPlayer).toBeNull();
      expect(result!.opposingPlayer).toBeNull();
    });

    it('returns null when native returns null', async () => {
      mocked(native.getMatchInfo).mockResolvedValue(null);
      expect(await mirror.getMatchInfo()).toBeNull();
    });
  });

  describe('getMedalInfo', () => {
    it('maps all 8 fields per ladder including streak / bestStarLevel', async () => {
      mocked(native.getMedalInfo).mockResolvedValue({
        standard: {
          leagueId: 5,
          starLevel: 34,
          stars: 3,
          streak: 2,
          legendRank: 0,
          seasonId: 150,
          seasonWins: 51,
          bestStarLevel: 34,
        },
      });
      const result = await mirror.getMedalInfo();
      expect(result!.standard).toEqual({
        leagueId: 5,
        starLevel: 34,
        stars: 3,
        streak: 2,
        legendRank: 0,
        seasonId: 150,
        seasonWins: 51,
        bestStarLevel: 34,
      });
      expect(result!.wild).toBeNull();
      expect(result!.classic).toBeNull();
      expect(result!.twist).toBeNull();
    });

    it('returns null when native returns null', async () => {
      mocked(native.getMedalInfo).mockResolvedValue(null);
      expect(await mirror.getMedalInfo()).toBeNull();
    });
  });

  describe('getDecks', () => {
    it('maps deck with new fields and string cardId in slots', async () => {
      mocked(native.getDecks).mockResolvedValue([makeNativeDeck()]);
      const result = await mirror.getDecks();
      expect(result).not.toBeNull();
      expect(result![0]!.id).toBe(999);
      expect(result![0]!.seasonId).toBe(150);
      expect(result![0]!.cards[0]).toEqual({ cardId: 'CS2_222', count: 2, premium: 0 });
    });

    it('returns null when native returns null', async () => {
      mocked(native.getDecks).mockResolvedValue(null);
      expect(await mirror.getDecks()).toBeNull();
    });
  });

  describe('getEditedDeck', () => {
    it('maps single deck via shared helper', async () => {
      mocked(native.getEditedDeck).mockResolvedValue(
        makeNativeDeck({ name: 'Edited', id: 12345 }),
      );
      const result = await mirror.getEditedDeck();
      expect(result?.name).toBe('Edited');
      expect(result?.id).toBe(12345);
    });

    it('returns null when no deck open', async () => {
      mocked(native.getEditedDeck).mockResolvedValue(null);
      expect(await mirror.getEditedDeck()).toBeNull();
    });
  });

  describe('getBoardState', () => {
    it('maps friendly + opposing entities', async () => {
      mocked(native.getBoardState).mockResolvedValue({
        friendly: [{ entityId: 4, cardId: 'HERO_06', zonePosition: 0, attack: 0, health: 30, damage: 0 }],
        opposing: [{ entityId: 5, cardId: 'HERO_04', zonePosition: 0, attack: 0, health: 30, damage: 0 }],
      });
      const result = await mirror.getBoardState();
      expect(result?.friendly).toHaveLength(1);
      expect(result?.opposing[0]?.cardId).toBe('HERO_04');
    });

    it('returns null outside of match', async () => {
      mocked(native.getBoardState).mockResolvedValue(null);
      expect(await mirror.getBoardState()).toBeNull();
    });
  });

  describe('getHandState', () => {
    it('exposes friendly hand list and opposing count only', async () => {
      mocked(native.getHandState).mockResolvedValue({
        friendlyHand: [
          { entityId: 10, cardId: 'CS2_022', zonePosition: 1 },
          { entityId: 11, cardId: 'GAME_005', zonePosition: 2 },
        ],
        opposingHandCount: 4,
      });
      const result = await mirror.getHandState();
      expect(result?.friendlyHand).toHaveLength(2);
      expect(result?.opposingHandCount).toBe(4);
    });
  });

  describe('getDeckState', () => {
    it('returns friendly deck entities + opposing count', async () => {
      mocked(native.getDeckState).mockResolvedValue({
        friendlyDeck: [{ entityId: 20, cardId: '' }],
        opposingDeckCount: 26,
      });
      const result = await mirror.getDeckState();
      expect(result?.friendlyDeck).toHaveLength(1);
      expect(result?.opposingDeckCount).toBe(26);
    });
  });

  describe('getOpponentSecrets', () => {
    it('returns secret list + count', async () => {
      mocked(native.getOpponentSecrets).mockResolvedValue({
        secrets: [{ entityId: 50, cardId: 'EX1_287', zonePosition: 1 }],
        count: 1,
      });
      const result = await mirror.getOpponentSecrets();
      expect(result?.count).toBe(1);
      expect(result?.secrets[0]?.cardId).toBe('EX1_287');
    });
  });

  describe('getChoices', () => {
    it('coerces undefined groups to null', async () => {
      mocked(native.getChoices).mockResolvedValue({});
      const result = await mirror.getChoices();
      expect(result).toEqual({ mulligan: null, general: null });
    });

    it('maps a populated mulligan group', async () => {
      mocked(native.getChoices).mockResolvedValue({
        mulligan: {
          sourceEntityId: 1,
          countMin: 0,
          countMax: 4,
          cards: [
            { entityId: 100, cardId: 'CS2_022' },
            { entityId: 101, cardId: 'CS2_029' },
          ],
        },
      });
      const result = await mirror.getChoices();
      expect(result?.mulligan?.cards).toHaveLength(2);
      expect(result?.general).toBeNull();
    });
  });

  describe('getServerInfo', () => {
    it('widens clientHandle to bigint', async () => {
      mocked(native.getServerInfo).mockResolvedValue({
        address: '127.0.0.1',
        port: 1119,
        gameHandle: 42,
        clientHandle: 1234567890,
        version: '1.0',
        spectatorMode: false,
        mission: 0,
        spectatorPassword: '',
        auroraPassword: '',
      });
      const result = await mirror.getServerInfo();
      expect(typeof result?.clientHandle).toBe('bigint');
      expect(result?.clientHandle).toBe(1234567890n);
    });

    it('returns null when native returns null', async () => {
      mocked(native.getServerInfo).mockResolvedValue(null);
      expect(await mirror.getServerInfo()).toBeNull();
    });
  });
});
