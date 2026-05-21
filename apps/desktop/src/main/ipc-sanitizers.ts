import type { SearchFilter } from '@hdt/hearthdb';

// Pool preview handlers take a `cardIds[]` from the renderer and fan
// each entry out to disk-cache fetches. A buggy / hostile renderer that
// sends a 50k-element array would otherwise queue 50k concurrent
// `ensureCardImageCached` tasks. Every real Hearthstone effect that
// produces a preview pool (Discover, Animal Companion, Sylvanas plays,
// etc.) tops out well under 30 cards — cap at 50 with headroom for a
// future "show entire class" or similar feature. Non-array / non-string
// inputs are silently rejected.
export const POOL_PREVIEW_CARD_LIMIT = 50;
export function capPoolCardIds(cardIds: unknown): string[] {
  if (!Array.isArray(cardIds)) return [];
  const out: string[] = [];
  for (const id of cardIds) {
    if (typeof id !== 'string') continue;
    out.push(id);
    if (out.length >= POOL_PREVIEW_CARD_LIMIT) break;
  }
  return out;
}

// Defensive sanitizer for the renderer-supplied SearchFilter. hearthdb's
// `matches()` calls `.toLowerCase()` / `.includes()` / numeric
// comparisons on filter fields without re-validation, so a malformed
// shape (`query: 42`, `mechanic: { length: 1e9 }`, `cardClass:
// new Array(1e6)`) throws inside the search loop or burns CPU. Return
// null when the filter itself isn't an object — caller short-circuits
// to `[]`. Unknown fields are dropped.
export const SEARCH_FILTER_STRING_LIMIT = 128;
export const SEARCH_FILTER_ARRAY_LIMIT = 32;
export const SEARCH_FILTER_LIMIT_MAX = 500;
export function sanitizeSearchFilter(filter: unknown): SearchFilter | null {
  if (typeof filter !== 'object' || filter === null || Array.isArray(filter)) return null;
  const f = filter as Record<string, unknown>;
  const out: SearchFilter = {};
  const trimmedString = (v: unknown): string | undefined => {
    if (typeof v !== 'string') return undefined;
    return v.length > SEARCH_FILTER_STRING_LIMIT ? v.slice(0, SEARCH_FILTER_STRING_LIMIT) : v;
  };
  const oneOrMany = <T extends string>(v: unknown): T | T[] | undefined => {
    if (typeof v === 'string') return v as T;
    if (Array.isArray(v)) {
      const arr = v.filter((x): x is T => typeof x === 'string').slice(0, SEARCH_FILTER_ARRAY_LIMIT);
      return arr.length > 0 ? arr : undefined;
    }
    return undefined;
  };
  const finiteNum = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  const q = trimmedString(f['query']);
  if (q !== undefined) out.query = q;
  if (typeof f['cost'] === 'number' && Number.isFinite(f['cost'])) {
    out.cost = f['cost'];
  } else if (typeof f['cost'] === 'object' && f['cost'] !== null && !Array.isArray(f['cost'])) {
    const range = f['cost'] as Record<string, unknown>;
    const min = finiteNum(range['min']);
    const max = finiteNum(range['max']);
    if (min !== undefined || max !== undefined) {
      out.cost = { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
    }
  }
  const cardClass = oneOrMany(f['cardClass']);
  if (cardClass !== undefined) out.cardClass = cardClass as NonNullable<SearchFilter['cardClass']>;
  const rarity = oneOrMany(f['rarity']);
  if (rarity !== undefined) out.rarity = rarity as NonNullable<SearchFilter['rarity']>;
  const set = oneOrMany(f['set']);
  if (set !== undefined) out.set = set as NonNullable<SearchFilter['set']>;
  const type = oneOrMany(f['type']);
  if (type !== undefined) out.type = type as NonNullable<SearchFilter['type']>;
  const mechanic = trimmedString(f['mechanic']);
  if (mechanic !== undefined) out.mechanic = mechanic;
  if (typeof f['collectible'] === 'boolean') out.collectible = f['collectible'];
  const limit = finiteNum(f['limit']);
  if (limit !== undefined && limit > 0) {
    out.limit = Math.min(Math.floor(limit), SEARCH_FILTER_LIMIT_MAX);
  }
  const offset = finiteNum(f['offset']);
  if (offset !== undefined && offset >= 0) out.offset = Math.floor(offset);
  return out;
}
