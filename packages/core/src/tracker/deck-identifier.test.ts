import { describe, expect, it, vi } from 'vitest';
import type { Deck, MatchInfo } from '@hdt/hearthmirror';
import {
  CallbackDeckIdentifier,
  ChainedDeckIdentifier,
  InGameDeckIdentifier,
  type IDeckIdentifier,
} from './deck-identifier';

const fakeDeck = (id: number, name: string): Deck => ({
  id,
  name,
  hero: 'HERO_01',
  formatType: 2,
  deckType: 1,
  seasonId: 0,
  cardbackId: 0,
  createDateMicrosec: 0,
  cards: [
    { cardId: 'A', count: 2, premium: 0 },
    { cardId: 'B', count: 1, premium: 0 },
  ],
});

const fakeMatch: MatchInfo = {
  localPlayer: null,
  opposingPlayer: null,
  missionId: 0,
  gameType: 0,
  formatType: 0,
  rankedSeasonId: 0,
  arenaSeasonId: 0,
  brawlSeasonId: 0,
};

describe('InGameDeckIdentifier', () => {
  it('returns null when mirror.getSelectedDeckId returns null (deck-picker scene unloaded)', async () => {
    const mirror = { getSelectedDeckId: vi.fn().mockResolvedValue(null) } as unknown as Parameters<typeof InGameDeckIdentifier['prototype']['identify']>[0] extends never ? never : import('@hdt/hearthmirror').HearthMirror;
    const id = new InGameDeckIdentifier(mirror);
    expect(await id.identify({ decks: [fakeDeck(1, 'A')], matchInfo: fakeMatch })).toBeNull();
  });

  it('returns null when selected deckId is 0 (template-only / face-card-only)', async () => {
    const mirror = {
      getSelectedDeckId: vi.fn().mockResolvedValue({
        deckId: 0n,
        templateDeckId: 100,
        formatType: 2,
      }),
    } as unknown as import('@hdt/hearthmirror').HearthMirror;
    const id = new InGameDeckIdentifier(mirror);
    expect(await id.identify({ decks: [fakeDeck(1, 'A')], matchInfo: fakeMatch })).toBeNull();
  });

  it('returns null when selected deckId is not in the decks list (template / dungeon)', async () => {
    const mirror = {
      getSelectedDeckId: vi.fn().mockResolvedValue({
        deckId: 999n,
        templateDeckId: 0,
        formatType: 2,
      }),
    } as unknown as import('@hdt/hearthmirror').HearthMirror;
    const id = new InGameDeckIdentifier(mirror);
    expect(await id.identify({ decks: [fakeDeck(1, 'A')], matchInfo: fakeMatch })).toBeNull();
  });

  it('resolves to the matching saved deck and builds an originalDeck snapshot', async () => {
    const mirror = {
      getSelectedDeckId: vi.fn().mockResolvedValue({
        deckId: 2n,
        templateDeckId: 0,
        formatType: 2,
      }),
    } as unknown as import('@hdt/hearthmirror').HearthMirror;
    const id = new InGameDeckIdentifier(mirror);
    const result = await id.identify({
      decks: [fakeDeck(1, 'A'), fakeDeck(2, 'B')],
      matchInfo: fakeMatch,
    });
    expect(result?.deckId).toBe(2);
    expect(result?.name).toBe('B');
    expect(result?.originalDeck.total()).toBe(3);
  });
});

describe('CallbackDeckIdentifier', () => {
  it('returns null when callback returns null', async () => {
    const id = new CallbackDeckIdentifier(async () => null);
    expect(await id.identify({ decks: [fakeDeck(1, 'A')], matchInfo: fakeMatch })).toBeNull();
  });

  it('builds an originalDeck snapshot when the chosen id matches', async () => {
    const id = new CallbackDeckIdentifier(async () => 2);
    const result = await id.identify({
      decks: [fakeDeck(1, 'A'), fakeDeck(2, 'B')],
      matchInfo: fakeMatch,
    });
    expect(result?.deckId).toBe(2);
    expect(result?.name).toBe('B');
    expect(result?.originalDeck.total()).toBe(3);
  });

  it('returns null when chosen id is not in the decks list', async () => {
    const id = new CallbackDeckIdentifier(async () => 999);
    expect(await id.identify({ decks: [fakeDeck(1, 'A')], matchInfo: fakeMatch })).toBeNull();
  });
});

describe('ChainedDeckIdentifier', () => {
  it('tries each identifier, returns first non-null', async () => {
    const a: IDeckIdentifier = { identify: vi.fn().mockResolvedValue(null) };
    const b: IDeckIdentifier = {
      identify: vi.fn().mockResolvedValue({
        deckId: 2,
        name: 'B',
        originalDeck: { total: () => 30 } as never,
      }),
    };
    const chained = new ChainedDeckIdentifier([a, b]);
    const result = await chained.identify({ decks: [], matchInfo: fakeMatch });
    expect(result?.deckId).toBe(2);
    expect(a.identify).toHaveBeenCalledTimes(1);
    expect(b.identify).toHaveBeenCalledTimes(1);
  });

  it('returns null when all identifiers return null', async () => {
    const chained = new ChainedDeckIdentifier([
      { identify: async () => null },
      { identify: async () => null },
    ]);
    expect(await chained.identify({ decks: [], matchInfo: fakeMatch })).toBeNull();
  });
});
