import { describe, expect, it } from 'vitest';
import type { PopularDeckEnriched } from './deck-types';
import { filterPopularDecks, sortPopularDecks } from './popular-deck-search';

const D = (over: Partial<PopularDeckEnriched>): PopularDeckEnriched => ({
  id: over.id ?? 'd1',
  name: over.name ?? 'Test',
  class: over.class ?? 'MAGE',
  format: over.format ?? 'Standard',
  archetype: over.archetype ?? 'Aggro',
  deckstring: over.deckstring ?? 'AAECxxxxx',
  winratePercent: over.winratePercent ?? 50,
  gamesCount: over.gamesCount ?? 1000,
  dustCost: over.dustCost ?? 5000,
  author: over.author ?? 'tester',
  updatedAt: over.updatedAt ?? '2026-04-20',
  classMatchups: over.classMatchups ?? [
    { opponentClass: 'DRUID', winratePercent: 55.5, gamesCount: 20, popularityPercent: 12.3 },
  ],
  manaCurve: over.manaCurve ?? [0, 0, 0, 0, 0, 0, 0, 0],
  keyCards: over.keyCards ?? [],
  cardNames: over.cardNames ?? [],
  deckCardList: over.deckCardList ?? [],
});

const SEED: PopularDeckEnriched[] = [
  D({ id: 'mage1',     class: 'MAGE',     archetype: 'Aggro',    dustCost: 4800, winratePercent: 58, gamesCount: 12000, updatedAt: '2026-04-25' }),
  D({ id: 'warrior1',  class: 'WARRIOR',  archetype: 'Control',  dustCost: 11200, winratePercent: 54, gamesCount: 8000, updatedAt: '2026-04-22' }),
  D({ id: 'hunter1',   class: 'HUNTER',   archetype: 'Midrange', dustCost: 6400, winratePercent: 56, gamesCount: 9000, updatedAt: '2026-04-26' }),
  D({ id: 'priest-w',  class: 'PRIEST',   archetype: 'Combo',    dustCost: 13400, winratePercent: 52, gamesCount: 6000, updatedAt: '2026-04-24', format: 'Wild' }),
];

describe('filterPopularDecks', () => {
  it('classFilter="all" returns the full list', () => {
    expect(filterPopularDecks(SEED, { classFilter: 'all' })).toHaveLength(SEED.length);
  });

  it('classFilter narrows to one class', () => {
    const result = filterPopularDecks(SEED, { classFilter: 'MAGE' });
    expect(result).toHaveLength(1);
    expect(result[0]!.class).toBe('MAGE');
  });

  it('maxDust excludes pricier decks', () => {
    const result = filterPopularDecks(SEED, { maxDust: 5000 });
    expect(result.every((d) => d.dustCost <= 5000)).toBe(true);
  });

  it('archetypeFilter narrows by archetype', () => {
    expect(filterPopularDecks(SEED, { archetypeFilter: 'Control' })).toHaveLength(1);
  });

  it('formatFilter narrows by format', () => {
    expect(filterPopularDecks(SEED, { formatFilter: 'Wild' })).toHaveLength(1);
    expect(filterPopularDecks(SEED, { formatFilter: 'Standard' })).toHaveLength(3);
  });

  it('includesCardName uses provided card-name lookup', () => {
    const result = filterPopularDecks(
      [SEED[0]!],
      {
        includesCardName: 'fire',
        cardNamesByDeckId: { mage1: ['Fireball', 'Polymorph'] },
      },
    );
    expect(result).toHaveLength(1);
  });

  it('excludesCardName drops decks containing the card', () => {
    const result = filterPopularDecks(
      [SEED[0]!],
      {
        excludesCardName: 'fireball',
        cardNamesByDeckId: { mage1: ['Fireball'] },
      },
    );
    expect(result).toHaveLength(0);
  });

  it('multiple criteria combine (AND)', () => {
    const result = filterPopularDecks(SEED, {
      classFilter: 'MAGE',
      maxDust: 5000,
      formatFilter: 'Standard',
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('mage1');
  });
});

describe('sortPopularDecks', () => {
  it('sort "winrate" orders by descending winrate', () => {
    const result = sortPopularDecks(SEED, 'winrate');
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.winratePercent).toBeGreaterThanOrEqual(result[i]!.winratePercent);
    }
  });

  it('sort "cheapest" orders by ascending dustCost', () => {
    const result = sortPopularDecks(SEED, 'cheapest');
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.dustCost).toBeLessThanOrEqual(result[i]!.dustCost);
    }
  });

  it('sort "popular" orders by descending gamesCount', () => {
    const result = sortPopularDecks(SEED, 'popular');
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.gamesCount).toBeGreaterThanOrEqual(result[i]!.gamesCount);
    }
  });

  it('sort "updated" orders by descending updatedAt', () => {
    const result = sortPopularDecks(SEED, 'updated');
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.updatedAt >= result[i]!.updatedAt).toBe(true);
    }
  });

  it('does not mutate the input', () => {
    const before = SEED.map((d) => d.id);
    sortPopularDecks(SEED, 'winrate');
    expect(SEED.map((d) => d.id)).toEqual(before);
  });
});
