import type { DeckCard } from './deck-types';

/**
 * Compute a stable, insertion-order-independent "hash" over a card list.
 * In practice this is the canonical sorted-and-aggregated string — not a
 * cryptographic digest. We don't need crypto strength here, just a stable
 * key for equality comparison and version-bump detection. Avoiding
 * `node:crypto` keeps `@hdt/core/deck` renderer-safe under Vite.
 */
export function canonicalCardListHash(cards: DeckCard[]): string {
  const aggregated = new Map<string, number>();
  for (const c of cards) {
    aggregated.set(c.cardId, (aggregated.get(c.cardId) ?? 0) + c.count);
  }
  return Array.from(aggregated.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([cardId, count]) => `${cardId}:${count}`)
    .join('|');
}

export function areCardListsEqual(a: DeckCard[], b: DeckCard[]): boolean {
  return canonicalCardListHash(a) === canonicalCardListHash(b);
}
