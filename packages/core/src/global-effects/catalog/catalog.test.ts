import { describe, expect, it } from 'vitest';
import { EFFECT_CATALOG } from './index';

describe('EFFECT_CATALOG', () => {
  it('is a non-empty readonly array', () => {
    expect(EFFECT_CATALOG.length).toBeGreaterThan(0);
  });

  it('has pairwise-unique effect ids', () => {
    const ids = EFFECT_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has pairwise-unique source card ids', () => {
    const sources = EFFECT_CATALOG.map((e) => e.sourceCardId);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it('every entry is a Standard caster effect (M1)', () => {
    for (const def of EFFECT_CATALOG) {
      expect(def.mode, `${def.id} mode`).toBe('STANDARD');
      expect(def.side, `${def.id} side`).toBe('caster');
    }
  });

  it('is sorted alphabetically by id', () => {
    const ids = EFFECT_CATALOG.map((e) => e.id);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });
});
