import { describe, it, expect } from 'vitest';
import { encodeDeck } from './encoder';
import { decodeDeck } from './decoder';
import { DeckFormat, type DeckBlueprint, type DeckCardEntry } from './types';

const sortByDbfId = (a: DeckCardEntry, b: DeckCardEntry): number => a.dbfId - b.dbfId;

describe('encodeDeck', () => {
  it('encodes empty deck deterministically', () => {
    const a = encodeDeck({ format: DeckFormat.Standard, heroes: [7], cards: [] });
    const b = encodeDeck({ format: DeckFormat.Standard, heroes: [7], cards: [] });
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('produces base64 string starting with AAE (reserved=0 + version=1)', () => {
    const s = encodeDeck({ format: DeckFormat.Standard, heroes: [7], cards: [] });
    expect(s.startsWith('AAE')).toBe(true);
  });

  it('throws on count = 0', () => {
    expect(() =>
      encodeDeck({
        format: DeckFormat.Standard,
        heroes: [7],
        cards: [{ dbfId: 1, count: 0 }],
      }),
    ).toThrow(/positive/i);
  });

  it('throws on negative count', () => {
    expect(() =>
      encodeDeck({
        format: DeckFormat.Standard,
        heroes: [7],
        cards: [{ dbfId: 1, count: -1 }],
      }),
    ).toThrow(/positive/i);
  });

  it('throws on non-integer count', () => {
    expect(() =>
      encodeDeck({
        format: DeckFormat.Standard,
        heroes: [7],
        cards: [{ dbfId: 1, count: 1.5 }],
      }),
    ).toThrow(/positive/i);
  });
});

describe('decodeDeck', () => {
  it('rejects empty string', () => {
    expect(() => decodeDeck('')).toThrow();
  });

  it('rejects garbage non-base64', () => {
    expect(() => decodeDeck('!@#$%^&*')).toThrow();
  });

  it('rejects wrong reserved byte', () => {
    const bad = Buffer.from([0x42, 0x01, 0x02, 0x01, 0x07, 0x00, 0x00, 0x00]).toString('base64');
    expect(() => decodeDeck(bad)).toThrow(/reserved byte/i);
  });

  it('rejects wrong version', () => {
    const bad = Buffer.from([0x00, 0x99, 0x02, 0x01, 0x07, 0x00, 0x00, 0x00]).toString('base64');
    expect(() => decodeDeck(bad)).toThrow(/version/i);
  });

  it('decodes empty Standard deck with hero 7', () => {
    const s = encodeDeck({ format: DeckFormat.Standard, heroes: [7], cards: [] });
    const d = decodeDeck(s);
    expect(d.format).toBe(DeckFormat.Standard);
    expect(d.heroes).toEqual([7]);
    expect(d.cards).toEqual([]);
  });
});

describe('round-trip', () => {
  const samples: ReadonlyArray<{ name: string; blueprint: DeckBlueprint }> = [
    {
      name: 'empty Standard, hero=7',
      blueprint: { format: DeckFormat.Standard, heroes: [7], cards: [] },
    },
    {
      name: 'single 1-copy card',
      blueprint: {
        format: DeckFormat.Standard,
        heroes: [7],
        cards: [{ dbfId: 1746, count: 1 }],
      },
    },
    {
      name: 'mixed 1/2/n copies',
      blueprint: {
        format: DeckFormat.Wild,
        heroes: [274],
        cards: [
          { dbfId: 100, count: 1 },
          { dbfId: 200, count: 2 },
          { dbfId: 300, count: 3 },
          { dbfId: 400, count: 5 },
        ],
      },
    },
    {
      name: 'realistic 30-card deck',
      blueprint: {
        format: DeckFormat.Standard,
        heroes: [7],
        cards: Array.from({ length: 15 }, (_, i) => ({
          dbfId: 1000 + i,
          count: 2,
        })),
      },
    },
    {
      name: 'large dbfIds (multi-byte varints)',
      blueprint: {
        format: DeckFormat.Standard,
        heroes: [7],
        cards: [
          { dbfId: 999_999, count: 1 },
          { dbfId: 1_234_567, count: 2 },
        ],
      },
    },
  ];

  for (const sample of samples) {
    it(`round-trips: ${sample.name}`, () => {
      const s = encodeDeck(sample.blueprint);
      const back = decodeDeck(s);

      expect(back.format).toBe(sample.blueprint.format);
      expect(back.heroes).toEqual(sample.blueprint.heroes);

      const expectedCards = [...sample.blueprint.cards].sort(sortByDbfId);
      const actualCards = [...back.cards].sort(sortByDbfId);
      expect(actualCards).toEqual(expectedCards);
    });
  }

  it('encodes the same blueprint to the same string (canonical)', () => {
    const a = encodeDeck({
      format: DeckFormat.Standard,
      heroes: [7],
      cards: [
        { dbfId: 300, count: 1 },
        { dbfId: 100, count: 1 },
        { dbfId: 200, count: 2 },
      ],
    });
    const b = encodeDeck({
      format: DeckFormat.Standard,
      heroes: [7],
      cards: [
        { dbfId: 100, count: 1 },
        { dbfId: 300, count: 1 },
        { dbfId: 200, count: 2 },
      ],
    });
    expect(a).toBe(b);
  });
});
