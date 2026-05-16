import { describe, expect, it } from 'vitest';
import type { CardDef } from '@hdt/hearthdb';
import { computeSetProgress } from './set-progress';

function card(overrides: Partial<CardDef> & { set: string }): CardDef {
  return {
    id: 'TEST_001',
    dbfId: 1,
    name: 'Test Card',
    cardClass: 'NEUTRAL',
    type: 'MINION',
    collectible: true,
    ...overrides,
  };
}

const STANDARD_CODE = 'SET_1810'; // Core — always in STANDARD_SET_CODES
const WILD_CODE = 'SET_12'; // Naxxramas — always wild

describe('computeSetProgress', () => {
  it('empty owned map yields zero owned counts', () => {
    const cards: CardDef[] = [
      card({ dbfId: 1, set: STANDARD_CODE, rarity: 'LEGENDARY' }),
      card({ dbfId: 2, set: STANDARD_CODE, rarity: 'COMMON' }),
      card({ dbfId: 3, set: STANDARD_CODE, rarity: 'COMMON' }),
    ];
    const result = computeSetProgress(cards, new Map());
    expect(result).toHaveLength(1);
    expect(result[0]!.totalCards).toBe(3);
    expect(result[0]!.totalCopies).toBe(1 + 2 + 2); // legendary=1, common=2 each
    expect(result[0]!.ownedCopies).toBe(0);
    expect(result[0]!.ownedUniqueCards).toBe(0);
  });

  it('legendary cap = 1, others cap = 2', () => {
    const cards: CardDef[] = [
      card({ dbfId: 1, set: STANDARD_CODE, rarity: 'LEGENDARY' }),
      card({ dbfId: 2, set: STANDARD_CODE, rarity: 'COMMON' }),
    ];
    const owned = new Map([[1, 1], [2, 2]]);
    const result = computeSetProgress(cards, owned);
    expect(result[0]!.ownedCopies).toBe(1 + 2);
    expect(result[0]!.ownedUniqueCards).toBe(2);
  });

  it('over-cap owned counts get capped', () => {
    const cards: CardDef[] = [
      card({ dbfId: 1, set: STANDARD_CODE, rarity: 'COMMON' }),
    ];
    const owned = new Map([[1, 5]]);
    const result = computeSetProgress(cards, owned);
    expect(result[0]!.ownedCopies).toBe(2); // capped at 2
    expect(result[0]!.ownedUniqueCards).toBe(1);
  });

  it('non-collectible cards are skipped', () => {
    const cards: CardDef[] = [
      card({ dbfId: 1, set: STANDARD_CODE, collectible: true }),
      card({ dbfId: 2, set: STANDARD_CODE, collectible: false }),
    ];
    const result = computeSetProgress(cards, new Map());
    expect(result[0]!.totalCards).toBe(1);
  });

  it('standard sets sort first in STANDARD_SET_CODES order, wild sets sort alphabetically', () => {
    const cards: CardDef[] = [
      card({ dbfId: 1, set: WILD_CODE }),
      card({ dbfId: 2, set: 'SET_13' }), // GvG — wild
      card({ dbfId: 3, set: STANDARD_CODE }),
    ];
    const result = computeSetProgress(cards, new Map());
    // Standard sets first
    expect(result[0]!.format).toBe('standard');
    expect(result[0]!.setCode).toBe(STANDARD_CODE);
    // Wild sets after, sorted alphabetically
    expect(result[1]!.format).toBe('wild');
    expect(result[2]!.format).toBe('wild');
    expect(result[1]!.setCode.localeCompare(result[2]!.setCode)).toBeLessThanOrEqual(0);
  });

  it('ownedUniqueCards reflects unique cards with count > 0', () => {
    const cards: CardDef[] = [
      card({ dbfId: 1, set: STANDARD_CODE, rarity: 'COMMON' }),
      card({ dbfId: 2, set: STANDARD_CODE, rarity: 'COMMON' }),
      card({ dbfId: 3, set: STANDARD_CODE, rarity: 'COMMON' }),
    ];
    const owned = new Map([[1, 2], [3, 1]]); // dbfId 2 not owned
    const result = computeSetProgress(cards, owned);
    expect(result[0]!.ownedUniqueCards).toBe(2);
  });

  it('rarity undefined is treated as non-legendary (legalMax = 2)', () => {
    const cards: CardDef[] = [
      card({ dbfId: 1, set: STANDARD_CODE }),
    ];
    const owned = new Map([[1, 3]]);
    const result = computeSetProgress(cards, owned);
    expect(result[0]!.totalCopies).toBe(2);
    expect(result[0]!.ownedCopies).toBe(2); // capped at 2
  });
});
