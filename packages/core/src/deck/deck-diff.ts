import { createHash } from 'node:crypto';

import type { DeckCard } from './deck-types';

/**
 * Compute a stable, insertion-order-independent hash over a card list.
 * Cards are aggregated by cardId, sorted lexicographically, then SHA-1ed.
 */
export function canonicalCardListHash(cards: DeckCard[]): string {
  const aggregated = new Map<string, number>();
  for (const c of cards) {
    aggregated.set(c.cardId, (aggregated.get(c.cardId) ?? 0) + c.count);
  }
  const canonical = Array.from(aggregated.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([cardId, count]) => `${cardId}:${count}`)
    .join('|');
  return createHash('sha1').update(canonical).digest('hex');
}

export function areCardListsEqual(a: DeckCard[], b: DeckCard[]): boolean {
  return canonicalCardListHash(a) === canonicalCardListHash(b);
}
