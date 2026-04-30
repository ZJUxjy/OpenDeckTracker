import { decodeDeck, type CardDef } from '@hdt/hearthdb';
import type { PopularDeckKeyCard } from '@hdt/core';

export type CardLookup = (dbfId: number) => CardDef | null;

/**
 * Buckets card *copies* (not unique cards) by mana cost into 8 cells:
 * `[0, 1, 2, 3, 4, 5, 6, 7+]`. Cards with cost 7 or higher fall into
 * the last bucket. Sum of the array equals the deck size.
 */
export function computeManaCurve(deckstring: string, cardLookup: CardLookup): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0];
  let blueprint;
  try {
    blueprint = decodeDeck(deckstring);
  } catch {
    return buckets;
  }
  for (const entry of blueprint.cards) {
    const card = cardLookup(entry.dbfId);
    const cost = typeof card?.cost === 'number' ? card.cost : 0;
    const bucket = cost >= 7 ? 7 : Math.max(0, Math.min(7, cost));
    buckets[bucket]! += entry.count;
  }
  return buckets;
}

/**
 * All distinct card names in the deck, in deck order. Used for renderer-side
 * filtering — UNCAPPED (unlike `computeKeyCards`).
 */
export function computeCardNames(deckstring: string, cardLookup: CardLookup): string[] {
  let blueprint;
  try {
    blueprint = decodeDeck(deckstring);
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const entry of blueprint.cards) {
    const card = cardLookup(entry.dbfId);
    if (card?.name) names.push(card.name);
  }
  return names;
}

const DUST_BY_RARITY: Record<string, number> = {
  COMMON: 40,
  RARE: 100,
  EPIC: 400,
  LEGENDARY: 1600,
};

/**
 * Crafting cost in dust, summed across all card copies. FREE rarity and
 * unknown rarities contribute 0. Cards the lookup can't resolve also
 * contribute 0 (graceful degradation, not error).
 */
export function computeDustCost(deckstring: string, cardLookup: CardLookup): number {
  let blueprint;
  try {
    blueprint = decodeDeck(deckstring);
  } catch {
    return 0;
  }
  let total = 0;
  for (const entry of blueprint.cards) {
    const card = cardLookup(entry.dbfId);
    if (!card) continue;
    const perCard = DUST_BY_RARITY[card.rarity ?? ''] ?? 0;
    total += perCard * entry.count;
  }
  return total;
}

/**
 * Distinct cards in the deck sorted by in-deck count desc, then cost asc.
 * Capped at 12 entries. Cards with no resolvable name are skipped.
 */
export function computeKeyCards(deckstring: string, cardLookup: CardLookup): PopularDeckKeyCard[] {
  let blueprint;
  try {
    blueprint = decodeDeck(deckstring);
  } catch {
    return [];
  }
  const rows: PopularDeckKeyCard[] = [];
  for (const entry of blueprint.cards) {
    const card = cardLookup(entry.dbfId);
    if (!card?.name) continue;
    rows.push({
      name: card.name,
      count: entry.count,
      cost: typeof card.cost === 'number' ? card.cost : 0,
    });
  }
  rows.sort((a, b) => b.count - a.count || a.cost - b.cost);
  return rows.slice(0, 12);
}
