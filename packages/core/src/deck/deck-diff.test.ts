import { describe, expect, it } from 'vitest';

import { areCardListsEqual, canonicalCardListHash } from './deck-diff';

describe('canonicalCardListHash', () => {
  it('returns equal hashes for identical multisets in different insertion order', () => {
    const a = [
      { cardId: 'A', count: 2 },
      { cardId: 'B', count: 1 },
      { cardId: 'C', count: 2 },
    ];
    const b = [
      { cardId: 'C', count: 2 },
      { cardId: 'A', count: 2 },
      { cardId: 'B', count: 1 },
    ];
    expect(canonicalCardListHash(a)).toBe(canonicalCardListHash(b));
  });

  it('returns unequal hashes for a single-copy difference', () => {
    const a = [{ cardId: 'A', count: 2 }];
    const b = [{ cardId: 'A', count: 1 }];
    expect(canonicalCardListHash(a)).not.toBe(canonicalCardListHash(b));
  });

  it('aggregates duplicate cardId entries before hashing', () => {
    const a = [
      { cardId: 'A', count: 1 },
      { cardId: 'A', count: 1 },
    ];
    const b = [{ cardId: 'A', count: 2 }];
    expect(canonicalCardListHash(a)).toBe(canonicalCardListHash(b));
  });

  it('hashes the empty list to a stable value', () => {
    expect(canonicalCardListHash([])).toBe(canonicalCardListHash([]));
  });
});

describe('areCardListsEqual', () => {
  it('returns true when hashes match (insertion-order independence)', () => {
    const a = [
      { cardId: 'A', count: 2 },
      { cardId: 'B', count: 1 },
    ];
    const b = [
      { cardId: 'B', count: 1 },
      { cardId: 'A', count: 2 },
    ];
    expect(areCardListsEqual(a, b)).toBe(true);
  });

  it('returns false on count mismatch', () => {
    const a = [{ cardId: 'A', count: 2 }];
    const b = [{ cardId: 'A', count: 1 }];
    expect(areCardListsEqual(a, b)).toBe(false);
  });
});
