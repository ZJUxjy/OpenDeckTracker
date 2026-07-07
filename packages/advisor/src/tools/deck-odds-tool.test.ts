import { describe, expect, test } from 'vitest';

import { computeDeckOdds } from './deck-odds-tool';

describe('deck odds tool', () => {
  test('computes hypergeometric odds to draw at least one target', () => {
    const result = computeDeckOdds({
      remaining: [
        { cardId: 'TARGET', count: 2 },
        { cardId: 'OTHER', count: 8 },
      ],
      targetCardIds: ['TARGET'],
      draws: 2,
    });

    expect(result.deckSize).toBe(10);
    expect(result.targetCopies).toBe(2);
    expect(result.probability).toBeCloseTo(1 - (8 / 10) * (7 / 9), 8);
  });

  test('returns guaranteed odds when a target is known on top within draw count', () => {
    expect(
      computeDeckOdds({
        remaining: [
          { cardId: 'TARGET', count: 1 },
          { cardId: 'OTHER', count: 9 },
        ],
        targetCardIds: ['TARGET'],
        draws: 1,
        knownPositions: [
          {
            cardId: 'TARGET',
            controllerId: 1,
            placement: 'top',
            insertedAt: 0,
            sourceCardId: 'SOURCE',
          },
        ],
      }).probability,
    ).toBe(1);
  });

  test('excludes unreachable known-bottom targets from shallow draw odds', () => {
    expect(
      computeDeckOdds({
        remaining: [
          { cardId: 'TARGET', count: 1 },
          { cardId: 'OTHER', count: 9 },
        ],
        targetCardIds: ['TARGET'],
        draws: 1,
        knownPositions: [
          {
            cardId: 'TARGET',
            controllerId: 1,
            placement: 'bottom',
            insertedAt: 0,
            sourceCardId: 'SOURCE',
          },
        ],
      }).probability,
    ).toBe(0);
  });
});
