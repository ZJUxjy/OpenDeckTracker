import { describe, expect, it } from 'vitest';
import { encodeDeck, DeckFormat, type CardDef } from '@hdt/hearthdb';
import { computeDustCost, computeKeyCards, computeManaCurve } from './popular-decks-derived';

function fakeCard(over: Partial<CardDef> & { id: string; name: string }): CardDef {
  return {
    id: over.id,
    dbfId: 0,
    name: over.name,
    cost: over.cost ?? 0,
    cardClass: 'NEUTRAL',
    set: 'TEST',
    type: 'MINION',
    collectible: true,
    ...(over.rarity ? { rarity: over.rarity } : {}),
  } as CardDef;
}

const CARDS_BY_DBFID: Record<number, CardDef> = {
  100: fakeCard({ id: 'C100', name: 'Acolyte', cost: 2 }),
  101: fakeCard({ id: 'C101', name: 'Brick', cost: 4 }),
  102: fakeCard({ id: 'C102', name: 'Cyclone', cost: 8 }),
  103: fakeCard({ id: 'C103', name: 'Dirge', cost: 12 }),
  104: fakeCard({ id: 'C104', name: 'Echo', cost: 0 }),
};
const lookup = (dbfId: number): CardDef | null => CARDS_BY_DBFID[dbfId] ?? null;

describe('computeManaCurve', () => {
  it('sums to deck size', () => {
    // 30 cards: 15 unique 2-of using a single dbfId duplicated 15 times would
    // violate encoder uniqueness, so build with 15 distinct dbfIds at 2-of.
    const cards = Array.from({ length: 15 }, (_, i) => ({ dbfId: 100 + i, count: 2 }));
    const lookupExt: typeof lookup = (id) => CARDS_BY_DBFID[id] ?? fakeCard({ id: `C${id}`, name: `Card${id}`, cost: 0 });
    const ds = encodeDeck({ format: DeckFormat.Standard, heroes: [7], cards });
    const curve = computeManaCurve(ds, lookupExt);
    expect(curve.reduce((s, n) => s + n, 0)).toBe(30);
  });

  it('cost-7+ cards bucket at index 7', () => {
    const ds = encodeDeck({
      format: DeckFormat.Standard,
      heroes: [7],
      cards: [{ dbfId: 102, count: 1 }, { dbfId: 103, count: 1 }],
    });
    const curve = computeManaCurve(ds, lookup);
    expect(curve[7]).toBe(2);
  });

  it('returns 8 zeros on garbage deckstring', () => {
    expect(computeManaCurve('not-a-deckstring', lookup)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('returns 8 zeros for empty deck', () => {
    const ds = encodeDeck({ format: DeckFormat.Standard, heroes: [7], cards: [] });
    expect(computeManaCurve(ds, lookup)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('computeKeyCards', () => {
  it('orders by count desc then cost asc', () => {
    const ds = encodeDeck({
      format: DeckFormat.Standard,
      heroes: [7],
      cards: [
        { dbfId: 101, count: 2 }, // Brick, cost 4
        { dbfId: 100, count: 1 }, // Acolyte, cost 2
      ],
    });
    const result = computeKeyCards(ds, lookup);
    expect(result.map((r) => r.name)).toEqual(['Brick', 'Acolyte']);
  });

  it('caps at 12 entries', () => {
    const cards = Array.from({ length: 30 }, (_, i) => ({ dbfId: 200 + i, count: 1 }));
    const lookupBig: typeof lookup = (id) =>
      fakeCard({ id: `C${id}`, name: `Card${id}`, cost: id % 8 });
    const ds = encodeDeck({ format: DeckFormat.Standard, heroes: [7], cards });
    expect(computeKeyCards(ds, lookupBig)).toHaveLength(12);
  });

  it('skips cards the lookup does not resolve', () => {
    const ds = encodeDeck({
      format: DeckFormat.Standard,
      heroes: [7],
      cards: [
        { dbfId: 100, count: 1 },
        { dbfId: 99999, count: 1 }, // unresolved
      ],
    });
    const result = computeKeyCards(ds, lookup);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Acolyte');
  });

  it('returns [] on garbage deckstring', () => {
    expect(computeKeyCards('xxx', lookup)).toEqual([]);
  });
});

describe('computeDustCost', () => {
  const lookupRarity = (dbfId: number) => {
    const map: Record<number, CardDef> = {
      300: fakeCard({ id: 'C300', name: 'Common', cost: 1, rarity: 'COMMON' }),
      301: fakeCard({ id: 'C301', name: 'Rare', cost: 2, rarity: 'RARE' }),
      302: fakeCard({ id: 'C302', name: 'Epic', cost: 3, rarity: 'EPIC' }),
      303: fakeCard({ id: 'C303', name: 'Legendary', cost: 4, rarity: 'LEGENDARY' }),
    };
    return map[dbfId] ?? null;
  };

  it('sums by rarity (40/100/400/1600 per copy)', () => {
    const ds = encodeDeck({
      format: DeckFormat.Standard,
      heroes: [7],
      cards: [
        { dbfId: 300, count: 2 }, // 2 commons = 80
        { dbfId: 301, count: 2 }, // 2 rares = 200
        { dbfId: 302, count: 1 }, // 1 epic = 400
        { dbfId: 303, count: 1 }, // 1 legendary = 1600
      ],
    });
    expect(computeDustCost(ds, lookupRarity)).toBe(2280);
  });

  it('skips unknown cards (counted as 0 dust)', () => {
    const ds = encodeDeck({
      format: DeckFormat.Standard,
      heroes: [7],
      cards: [
        { dbfId: 300, count: 2 },   // 80
        { dbfId: 99999, count: 2 }, // unresolved → 0
      ],
    });
    expect(computeDustCost(ds, lookupRarity)).toBe(80);
  });

  it('returns 0 on garbage deckstring', () => {
    expect(computeDustCost('xxx', lookupRarity)).toBe(0);
  });
});
