import { expect, it } from 'vitest';
import { compareDeckVersions } from './deck-version-comparison';
import type { DeckVersion } from '../deck/deck-types';
import type { MatchHistoryRecord } from './match-history';

it('compares immutable lists and only attributes explicitly versioned outcomes', () => {
  const before: DeckVersion = { deckId: 'deck', version: 1, cards: [{ cardId: 'A', count: 2 }], cardListHash: 'a', createdAt: 1 };
  const after: DeckVersion = { ...before, version: 2, cards: [{ cardId: 'A', count: 1 }, { cardId: 'B', count: 1 }] };
  const matches = [
    { savedDeckId: 'deck', savedDeckVersion: 1, result: 'win', opponentClass: 'MAGE', turnCount: 8 },
    { savedDeckId: 'deck', savedDeckVersion: 1, result: 'unknown', opponentClass: 'MAGE' },
    { savedDeckId: 'deck', savedDeckVersion: 2, result: 'loss', opponentClass: 'ROGUE', turnCount: 12 },
    { savedDeckId: 'deck', result: 'win' },
  ] as MatchHistoryRecord[];
  const comparison = compareDeckVersions(before, after, matches);
  expect(comparison.removed).toEqual([{ cardId: 'A', count: 1 }]);
  expect(comparison.added).toEqual([{ cardId: 'B', count: 1 }]);
  expect(comparison.before).toMatchObject({ games: 2, wins: 1, losses: 0, unknown: 1, winRate: 1, averageTurns: 8, turnSamples: 1 });
  expect(comparison.after).toMatchObject({ games: 1, wins: 0, losses: 1, winRate: 0, averageTurns: 12 });
  expect(comparison.unattributedGames).toBe(1);
  expect(before.cards).toEqual([{ cardId: 'A', count: 2 }]);
});
