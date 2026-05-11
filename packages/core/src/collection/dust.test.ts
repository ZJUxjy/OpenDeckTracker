import { describe, expect, it } from 'vitest';
import type { Rarity } from '@hdt/hearthdb';
import { dustValueForRarity, maxCopiesForRarity } from './dust';

describe('maxCopiesForRarity', () => {
  it('caps legendaries at 1', () => {
    expect(maxCopiesForRarity('LEGENDARY')).toBe(1);
    expect(maxCopiesForRarity('COMMON')).toBe(2);
    expect(maxCopiesForRarity('RARE')).toBe(2);
    expect(maxCopiesForRarity('EPIC')).toBe(2);
    expect(maxCopiesForRarity('FREE')).toBe(2);
  });
});

describe('dustValueForRarity', () => {
  it('returns standard disenchant values', () => {
    const cases: Array<[Rarity, number]> = [
      ['COMMON', 40],
      ['RARE', 100],
      ['EPIC', 400],
      ['LEGENDARY', 1600],
      ['FREE', 0],
    ];
    for (const [rarity, expected] of cases) {
      expect(dustValueForRarity(rarity)).toBe(expected);
    }
  });
});
