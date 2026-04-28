import { describe, expect, it } from 'vitest';

import { createDeck, type HeroClass } from '@hdt/core';
import {
  type DeckCodecLookup,
  DeckstringDecodeError,
  fromDeckstring,
  fromJson,
  IllegalDeckExportError,
  toDeckstring,
  toJson,
  UnknownCardError,
} from './deck-codec';

interface FakeCard {
  cardId: string;
  dbfId: number;
  class: HeroClass;
  rarity: string;
  type: string;
}

function makeLookup(cards: FakeCard[], heroDbfByClass: Partial<Record<HeroClass, number>>): DeckCodecLookup {
  const byCardId = new Map(cards.map((c) => [c.cardId, c]));
  const byDbfId = new Map(cards.map((c) => [c.dbfId, c]));
  return {
    byCardId(cardId) {
      return byCardId.get(cardId) ?? null;
    },
    byDbfId(dbfId) {
      return byDbfId.get(dbfId) ?? null;
    },
    heroDbfIdForClass(heroClass) {
      return heroDbfByClass[heroClass] ?? null;
    },
  };
}

const DRUID_HERO_CARD: FakeCard = {
  cardId: 'HERO_06',
  dbfId: 274,
  class: 'DRUID',
  rarity: 'FREE',
  type: 'HERO',
};

function legalDruidDeckCards(): FakeCard[] {
  // 14 unique commons + 2 legendaries = 16 unique cards making 30 total
  const cards: FakeCard[] = [];
  for (let i = 0; i < 14; i += 1) {
    cards.push({
      cardId: `D_C_${i}`,
      dbfId: 1000 + i,
      class: 'DRUID',
      rarity: 'COMMON',
      type: 'SPELL',
    });
  }
  cards.push({ cardId: 'D_LEG_A', dbfId: 2000, class: 'DRUID', rarity: 'LEGENDARY', type: 'MINION' });
  cards.push({ cardId: 'D_LEG_B', dbfId: 2001, class: 'NEUTRAL', rarity: 'LEGENDARY', type: 'MINION' });
  return cards;
}

function lookupForLegal(extras: FakeCard[] = []): DeckCodecLookup {
  return makeLookup([DRUID_HERO_CARD, ...legalDruidDeckCards(), ...extras], { DRUID: 274 });
}

describe('toDeckstring / fromDeckstring', () => {
  it('round-trips a 30-card legal Druid deck', () => {
    const fakeCards = legalDruidDeckCards();
    const lookup = lookupForLegal();
    const cardEntries = [
      ...fakeCards.slice(0, 14).map((c) => ({ cardId: c.cardId, count: 2 })),
      { cardId: 'D_LEG_A', count: 1 },
      { cardId: 'D_LEG_B', count: 1 },
    ];
    const deck = createDeck({ name: 'Round', class: 'DRUID', format: 'Standard', cards: cardEntries });

    const encoded = toDeckstring(deck, lookup);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = fromDeckstring(encoded, lookup);
    expect(decoded.class).toBe('DRUID');
    expect(decoded.format).toBe('Standard');
    const totalCount = decoded.cards.reduce((s, c) => s + c.count, 0);
    expect(totalCount).toBe(30);
  });

  it('throws IllegalDeckExportError on a 16-card deck', () => {
    const fakeCards = legalDruidDeckCards();
    const lookup = lookupForLegal();
    const deck = createDeck({
      name: 'Half',
      class: 'DRUID',
      format: 'Standard',
      cards: fakeCards.slice(0, 8).map((c) => ({ cardId: c.cardId, count: 2 })),
    });
    expect(() => toDeckstring(deck, lookup)).toThrow(IllegalDeckExportError);
  });

  it('throws UnknownCardError when decoded dbfId is missing from lookup', () => {
    const fakeCards = legalDruidDeckCards();
    const phantom: FakeCard = {
      cardId: 'PHANTOM',
      dbfId: 99999,
      class: 'DRUID',
      rarity: 'COMMON',
      type: 'SPELL',
    };
    const encodeLookup = lookupForLegal([phantom]);
    // Build a 30-card deck swapping one common copy for PHANTOM x2 to keep total at 30
    const cardEntries = [
      ...fakeCards.slice(0, 13).map((c) => ({ cardId: c.cardId, count: 2 })),
      { cardId: 'PHANTOM', count: 2 },
      { cardId: 'D_LEG_A', count: 1 },
      { cardId: 'D_LEG_B', count: 1 },
    ];
    const deck = createDeck({ name: 'Phantom', class: 'DRUID', format: 'Standard', cards: cardEntries });
    const encoded = toDeckstring(deck, encodeLookup);

    // Decode with a lookup that knows about the hero but NOT phantom
    const decodeLookup = lookupForLegal();
    expect(() => fromDeckstring(encoded, decodeLookup)).toThrow(UnknownCardError);
  });

  it('throws DeckstringDecodeError on malformed base64', () => {
    const lookup = lookupForLegal();
    expect(() => fromDeckstring('not-a-valid-deckstring!@#', lookup)).toThrow(DeckstringDecodeError);
  });

  it('UnknownCardError carries the missing cardId/dbfId in the message', () => {
    const fakeCards = legalDruidDeckCards();
    const phantom: FakeCard = {
      cardId: 'PHANTOM',
      dbfId: 99999,
      class: 'DRUID',
      rarity: 'COMMON',
      type: 'SPELL',
    };
    const encodeLookup = lookupForLegal([phantom]);
    const cardEntries = [
      ...fakeCards.slice(0, 13).map((c) => ({ cardId: c.cardId, count: 2 })),
      { cardId: 'PHANTOM', count: 2 },
      { cardId: 'D_LEG_A', count: 1 },
      { cardId: 'D_LEG_B', count: 1 },
    ];
    const deck = createDeck({ name: 'Phantom', class: 'DRUID', format: 'Standard', cards: cardEntries });
    const encoded = toDeckstring(deck, encodeLookup);
    const decodeLookup = lookupForLegal();

    try {
      fromDeckstring(encoded, decodeLookup);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownCardError);
      expect((err as UnknownCardError).message).toContain('99999');
      expect((err as UnknownCardError).name).toBe('UnknownCardError');
    }
  });
});

describe('toJson / fromJson', () => {
  it('round-trips notes and tags', () => {
    const deck = createDeck({
      name: 'Notes',
      class: 'MAGE',
      format: 'Wild',
      notes: 'Mulligan keep: Innervate, Wild Growth',
      tags: ['casual', 'meme'],
      cards: [{ cardId: 'EX1_561', count: 2 }],
    });
    const json = toJson(deck);
    const restored = fromJson(json);
    expect(restored.notes).toBe(deck.notes);
    expect(restored.tags).toEqual(deck.tags);
    expect(restored.cards).toEqual(deck.cards);
  });

  it('json envelope carries schemaVersion', () => {
    const deck = createDeck({ name: 'V', class: 'PRIEST', format: 'Standard' });
    const json = toJson(deck);
    const parsed = JSON.parse(json) as { schemaVersion: number };
    expect(parsed.schemaVersion).toBe(1);
  });

  it('fromJson throws DeckstringDecodeError on schemaVersion mismatch', () => {
    const bogus = JSON.stringify({ schemaVersion: 999, deck: {} });
    expect(() => fromJson(bogus)).toThrow(DeckstringDecodeError);
  });

  it('fromJson throws DeckstringDecodeError on malformed JSON', () => {
    expect(() => fromJson('not-json{')).toThrow(DeckstringDecodeError);
  });
});
