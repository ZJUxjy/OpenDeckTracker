import { describe, expect, it } from 'vitest';
import {
  POOL_PREVIEW_CARD_LIMIT,
  SEARCH_FILTER_ARRAY_LIMIT,
  SEARCH_FILTER_LIMIT_MAX,
  SEARCH_FILTER_STRING_LIMIT,
  capPoolCardIds,
  sanitizeSearchFilter,
} from './ipc-sanitizers';

describe('capPoolCardIds', () => {
  it('passes through small string arrays unchanged', () => {
    expect(capPoolCardIds(['A', 'B', 'C'])).toEqual(['A', 'B', 'C']);
  });

  it('caps at POOL_PREVIEW_CARD_LIMIT entries', () => {
    const huge = Array.from({ length: 5000 }, (_, i) => `C${i}`);
    expect(capPoolCardIds(huge)).toHaveLength(POOL_PREVIEW_CARD_LIMIT);
  });

  it('drops non-string entries silently', () => {
    expect(capPoolCardIds(['A', 42, null, undefined, 'B', { evil: 1 }])).toEqual(['A', 'B']);
  });

  it('returns [] for non-array input', () => {
    expect(capPoolCardIds(null)).toEqual([]);
    expect(capPoolCardIds(undefined)).toEqual([]);
    expect(capPoolCardIds('A,B,C')).toEqual([]);
    expect(capPoolCardIds({ 0: 'A', length: 1 })).toEqual([]);
  });
});

describe('sanitizeSearchFilter', () => {
  it('returns null for non-object input', () => {
    expect(sanitizeSearchFilter(null)).toBeNull();
    expect(sanitizeSearchFilter(undefined)).toBeNull();
    expect(sanitizeSearchFilter('mage')).toBeNull();
    expect(sanitizeSearchFilter(42)).toBeNull();
    expect(sanitizeSearchFilter(['mage'])).toBeNull();
  });

  it('drops unknown fields and keeps recognized scalars', () => {
    const result = sanitizeSearchFilter({
      query: 'felblast',
      mechanic: 'TAUNT',
      collectible: true,
      __proto__: { evil: true },
      somethingElse: 'ignored',
    });
    expect(result).toEqual({
      query: 'felblast',
      mechanic: 'TAUNT',
      collectible: true,
    });
  });

  it('caps string fields at SEARCH_FILTER_STRING_LIMIT', () => {
    const long = 'x'.repeat(SEARCH_FILTER_STRING_LIMIT + 100);
    const result = sanitizeSearchFilter({ query: long, mechanic: long });
    expect(result?.query?.length).toBe(SEARCH_FILTER_STRING_LIMIT);
    expect(result?.mechanic?.length).toBe(SEARCH_FILTER_STRING_LIMIT);
  });

  it('caps array fields at SEARCH_FILTER_ARRAY_LIMIT and drops non-string entries', () => {
    const arr = Array.from({ length: SEARCH_FILTER_ARRAY_LIMIT + 50 }, (_, i) => `SET_${i}`);
    const result = sanitizeSearchFilter({ set: [...arr, 42, null, { x: 1 }] });
    expect(Array.isArray(result?.set)).toBe(true);
    expect((result?.set as string[]).length).toBe(SEARCH_FILTER_ARRAY_LIMIT);
    expect((result?.set as string[]).every((s) => typeof s === 'string')).toBe(true);
  });

  it('rejects non-finite cost and clamps the limit', () => {
    expect(sanitizeSearchFilter({ cost: NaN })?.cost).toBeUndefined();
    expect(sanitizeSearchFilter({ cost: Infinity })?.cost).toBeUndefined();
    expect(sanitizeSearchFilter({ cost: 5 })?.cost).toBe(5);
    expect(sanitizeSearchFilter({ cost: { min: 1, max: 7 } })?.cost).toEqual({ min: 1, max: 7 });
    expect(sanitizeSearchFilter({ cost: { min: 'a' as unknown as number } })?.cost).toBeUndefined();
    expect(sanitizeSearchFilter({ limit: 1e9 })?.limit).toBe(SEARCH_FILTER_LIMIT_MAX);
    expect(sanitizeSearchFilter({ limit: -1 })?.limit).toBeUndefined();
    expect(sanitizeSearchFilter({ offset: -1 })?.offset).toBeUndefined();
    expect(sanitizeSearchFilter({ offset: 25 })?.offset).toBe(25);
  });
});
