import { describe, expect, it } from 'vitest';
import type { PopularDeckEnriched } from '../deck/deck-types';
import { predictOpponentDecks } from './opponent-deck-prediction';

function deck(over: Partial<PopularDeckEnriched> & { id: string }): PopularDeckEnriched {
  return {
    id: over.id,
    name: over.name ?? over.id,
    class: over.class ?? 'MAGE',
    format: over.format ?? 'Standard',
    archetype: over.archetype ?? 'Tempo',
    deckstring: over.deckstring ?? `DS:${over.id}`,
    winratePercent: over.winratePercent ?? 50,
    gamesCount: over.gamesCount ?? 1000,
    author: over.author ?? 'hsguru',
    updatedAt: over.updatedAt ?? '2026-05-09',
    manaCurve: over.manaCurve ?? [0, 0, 0, 0, 0, 0, 0, 0],
    keyCards: over.keyCards ?? [],
    cardNames: over.cardNames ?? [],
    dustCost: over.dustCost ?? 0,
  };
}

const MAGE_FIREBALL = deck({
  id: 'mage-fb',
  class: 'MAGE',
  deckstring: 'DS:mage-fb',
  gamesCount: 5000,
});
const MAGE_FROST = deck({
  id: 'mage-frost',
  class: 'MAGE',
  deckstring: 'DS:mage-frost',
  gamesCount: 3000,
});
const ROGUE_TEMPO = deck({
  id: 'rogue-tempo',
  class: 'ROGUE',
  deckstring: 'DS:rogue-tempo',
});
const MAGE_WILD = deck({
  id: 'mage-wild',
  class: 'MAGE',
  format: 'Wild',
  deckstring: 'DS:mage-wild',
});

const lookup = (deckstring: string): ReadonlyMap<string, number> | null => {
  switch (deckstring) {
    case 'DS:mage-fb':
      return new Map([
        ['CS2_029', 2],
        ['CS2_023', 2],
      ]);
    case 'DS:mage-frost':
      return new Map([
        ['CS2_024', 2],
        ['CS2_023', 2],
      ]);
    case 'DS:rogue-tempo':
      return new Map([['CS2_074', 2]]);
    case 'DS:mage-wild':
      return new Map([['CS2_029', 2]]);
    case 'DS:bad':
      return null;
    default:
      return new Map();
  }
};

describe('predictOpponentDecks', () => {
  it('returns [] for empty observation', () => {
    const result = predictOpponentDecks({
      observedCards: [],
      opponentClass: 'MAGE',
      format: 'Standard',
      candidates: [MAGE_FIREBALL],
      deckCardLookup: lookup,
    });
    expect(result).toEqual([]);
  });

  it('returns [] when every observed card is created', () => {
    const result = predictOpponentDecks({
      observedCards: [
        { cardId: 'CS2_029', created: true },
        { cardId: 'CS2_023', created: true },
      ],
      opponentClass: 'MAGE',
      format: 'Standard',
      candidates: [MAGE_FIREBALL],
      deckCardLookup: lookup,
    });
    expect(result).toEqual([]);
  });

  it('class filter narrows candidates', () => {
    const result = predictOpponentDecks({
      observedCards: [{ cardId: 'CS2_029', created: false }],
      opponentClass: 'MAGE',
      format: null,
      candidates: [MAGE_FIREBALL, ROGUE_TEMPO],
      deckCardLookup: lookup,
    });
    expect(result.every((p) => p.deck.class === 'MAGE')).toBe(true);
    expect(result.find((p) => p.deck.id === 'rogue-tempo')).toBeUndefined();
  });

  it('format filter narrows candidates', () => {
    const result = predictOpponentDecks({
      observedCards: [{ cardId: 'CS2_029', created: false }],
      opponentClass: 'MAGE',
      format: 'Standard',
      candidates: [MAGE_FIREBALL, MAGE_WILD],
      deckCardLookup: lookup,
    });
    expect(result.every((p) => p.deck.format === 'Standard')).toBe(true);
    expect(result.find((p) => p.deck.id === 'mage-wild')).toBeUndefined();
  });

  it('created cards are excluded from observed multiset', () => {
    const result = predictOpponentDecks({
      observedCards: [
        { cardId: 'CS2_023', created: false },
        { cardId: 'CS2_029', created: true },
      ],
      opponentClass: 'MAGE',
      format: null,
      candidates: [MAGE_FIREBALL],
      deckCardLookup: lookup,
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.observedOriginalCount).toBe(1);
    expect(result[0]!.matchedCount).toBe(1);
    expect(result[0]!.score).toBe(1);
  });

  it('score = 1.0 when observed ⊆ deck', () => {
    const result = predictOpponentDecks({
      observedCards: [
        { cardId: 'CS2_029', created: false },
        { cardId: 'CS2_029', created: false },
      ],
      opponentClass: 'MAGE',
      format: null,
      candidates: [MAGE_FIREBALL],
      deckCardLookup: lookup,
    });
    expect(result[0]!.score).toBe(1);
    expect(result[0]!.matchedCount).toBe(2);
  });

  it('tiebreak by gamesCount desc when scores are tied', () => {
    const result = predictOpponentDecks({
      observedCards: [{ cardId: 'CS2_023', created: false }],
      opponentClass: 'MAGE',
      format: null,
      candidates: [MAGE_FROST, MAGE_FIREBALL],
      deckCardLookup: lookup,
    });
    expect(result[0]!.score).toBe(result[1]!.score);
    expect(result[0]!.deck.id).toBe('mage-fb');
  });

  it('confidence escalates with observation count', () => {
    const make = (n: number) =>
      Array.from({ length: n }, () => ({ cardId: 'CS2_029', created: false }));
    const low = predictOpponentDecks({
      observedCards: make(3),
      opponentClass: 'MAGE',
      format: null,
      candidates: [MAGE_FIREBALL],
      deckCardLookup: lookup,
    });
    const med = predictOpponentDecks({
      observedCards: make(7),
      opponentClass: 'MAGE',
      format: null,
      candidates: [MAGE_FIREBALL],
      deckCardLookup: lookup,
    });
    const high = predictOpponentDecks({
      observedCards: make(12),
      opponentClass: 'MAGE',
      format: null,
      candidates: [MAGE_FIREBALL],
      deckCardLookup: lookup,
    });
    expect(low[0]!.confidence).toBe('low');
    expect(med[0]!.confidence).toBe('medium');
    expect(high[0]!.confidence).toBe('high');
  });

  it('result is truncated to topN', () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      deck({
        id: `mage-${i}`,
        class: 'MAGE',
        deckstring: `DS:mage-${i}`,
        gamesCount: 1000 - i,
      }),
    );
    const wideLookup = (): ReadonlyMap<string, number> => new Map([['CS2_029', 2]]);
    const result = predictOpponentDecks({
      observedCards: [{ cardId: 'CS2_029', created: false }],
      opponentClass: 'MAGE',
      format: null,
      candidates,
      deckCardLookup: wideLookup,
      topN: 5,
    });
    expect(result).toHaveLength(5);
  });

  it('drops candidates whose deckstring fails to decode (no throw)', () => {
    const badDeck = deck({ id: 'bad', class: 'MAGE', deckstring: 'DS:bad' });
    const result = predictOpponentDecks({
      observedCards: [{ cardId: 'CS2_029', created: false }],
      opponentClass: 'MAGE',
      format: null,
      candidates: [badDeck, MAGE_FIREBALL],
      deckCardLookup: lookup,
    });
    expect(result.find((p) => p.deck.id === 'bad')).toBeUndefined();
    expect(result.find((p) => p.deck.id === 'mage-fb')).toBeDefined();
  });
});
