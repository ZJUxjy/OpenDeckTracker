import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadCards } from './card-loader';
import type { CardDb } from './card-db';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tinyPath = resolve(__dirname, 'tests/fixtures/tiny-cards.json');

describe('CardDb.search', () => {
  let db: CardDb;

  beforeAll(async () => {
    db = await loadCards(tinyPath);
  });

  it('filters by single cost', () => {
    const r = db.search({ cost: 1, limit: 1000 });
    expect(r.length).toBe(2);
    expect(r.every((c) => c.cost === 1)).toBe(true);
  });

  it('filters by cost range', () => {
    const r = db.search({ cost: { min: 2, max: 4 }, limit: 1000 });
    expect(r.every((c) => c.cost! >= 2 && c.cost! <= 4)).toBe(true);
    expect(r.length).toBeGreaterThan(0);
  });

  it('AND combines class+type', () => {
    const r = db.search({ cardClass: 'MAGE', type: 'SPELL', limit: 1000 });
    expect(r.length).toBe(3);
    expect(r.every((c) => c.cardClass === 'MAGE' && c.type === 'SPELL')).toBe(true);
  });

  it('query matches name case-insensitive', () => {
    const r = db.search({ query: 'firebALL', limit: 1000 });
    expect(r.length).toBe(1);
    expect(r[0]!.id).toBe('CS2_029');
  });

  it('query matches text', () => {
    const r = db.search({ query: 'random', limit: 1000 });
    expect(r.some((c) => c.id === 'EX1_277')).toBe(true);
  });

  it('filters by mechanic', () => {
    const r = db.search({ mechanic: 'DIVINE_SHIELD', limit: 1000 });
    expect(r.length).toBe(1);
    expect(r[0]!.id).toBe('EX1_008');
  });

  it('filters by class array', () => {
    const r = db.search({ cardClass: ['MAGE', 'ROGUE'], limit: 1000 });
    expect(r.every((c) => c.cardClass === 'MAGE' || c.cardClass === 'ROGUE')).toBe(true);
  });

  it('limit + offset disjoint pagination', () => {
    const a = db.search({ cardClass: 'NEUTRAL', limit: 2, offset: 0 });
    const b = db.search({ cardClass: 'NEUTRAL', limit: 2, offset: 2 });
    expect(a.length).toBe(2);
    const overlap = a.filter((c) => b.some((d) => d.id === c.id));
    expect(overlap.length).toBe(0);
  });

  it('returns empty array on no match', () => {
    const r = db.search({ cost: 99 });
    expect(r).toEqual([]);
  });
});
