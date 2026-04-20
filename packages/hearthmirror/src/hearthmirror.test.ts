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
  getCollection: vi.fn(),
  getArenaDeck: vi.fn(),
  getBattlegroundRatingInfo: vi.fn(),
  getServerInfo: vi.fn(),
}));

import * as native from '@hdt/hearthmirror-native';
import { HearthMirror } from './hearthmirror';

const mocked = vi.mocked;

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

  describe('getMatchInfo', () => {
    const makePlayer = () => ({
      id: 1,
      name: 'Bob',
      accountIdHi: 100,
      accountIdLo: 200,
      battleTagName: 'Bob',
      battleTagFull: 'Bob#5678',
      standardRank: 5,
      wildRank: 3,
      classicRank: 1,
      twistRank: 0,
    });

    it('maps nested player shape: accountId as BigInt, battleTag object', async () => {
      mocked(native.getMatchInfo).mockResolvedValue({
        localPlayer: makePlayer(),
        opposingPlayer: makePlayer(),
        missionId: 2,
        gameType: 3,
        formatType: 2,
      });
      const result = await mirror.getMatchInfo();
      expect(result).not.toBeNull();
      expect(result!.localPlayer.accountId).toEqual({ hi: 100n, lo: 200n });
      expect(result!.localPlayer.battleTag).toEqual({ name: 'Bob', fullBattleTag: 'Bob#5678' });
      expect(result!.missionId).toBe(2);
      expect(result!.gameType).toBe(3);
    });

    it('returns null when native returns null', async () => {
      mocked(native.getMatchInfo).mockResolvedValue(null);
      expect(await mirror.getMatchInfo()).toBeNull();
    });
  });

  describe('getMedalInfo', () => {
    it('maps standard medal data and nullifies absent fields', async () => {
      mocked(native.getMedalInfo).mockResolvedValue({
        standard: {
          leagueId: 2,
          starLevel: 5,
          stars: 3,
          legendRank: 0,
          seasonId: 130,
          seasonWins: 12,
        },
      });
      const result = await mirror.getMedalInfo();
      expect(result).not.toBeNull();
      expect(result!.standard).toEqual({
        leagueId: 2,
        starLevel: 5,
        stars: 3,
        legendRank: 0,
        seasonId: 130,
        seasonWins: 12,
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
    it('maps deck id to number', async () => {
      mocked(native.getDecks).mockResolvedValue([
        {
          id: 999,
          name: 'Aggro',
          hero: 'HERO_01',
          formatType: 2,
          deckType: 1,
          cards: [{ dbfId: 100, count: 2, premium: 0 }],
        },
      ]);
      const result = await mirror.getDecks();
      expect(result).not.toBeNull();
      expect(result![0]!.id).toBe(999);
      expect(result![0]!.cards[0]).toEqual({ dbfId: 100, count: 2, premium: 0 });
    });

    it('returns null when native returns null', async () => {
      mocked(native.getDecks).mockResolvedValue(null);
      expect(await mirror.getDecks()).toBeNull();
    });
  });

  describe('isMulligan', () => {
    it('returns the native mulligan state', async () => {
      mocked(native.isMulligan).mockResolvedValue(true);
      await expect(mirror.isMulligan()).resolves.toBe(true);
    });

    it('returns null when native cannot resolve mulligan state', async () => {
      mocked(native.isMulligan).mockResolvedValue(null);
      await expect(mirror.isMulligan()).resolves.toBeNull();
    });
  });
});
