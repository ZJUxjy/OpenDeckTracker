import type { Deck, DeckCard, HeroClass, ValidityIssue } from './deck-types';

/**
 * Minimal projection of a card definition needed for legality checks.
 * Consumers can adapt their `@hdt/hearthdb` `CardDef` into this shape.
 */
export interface CardLegalityInfo {
  /**
   * The card's class. Should be `'NEUTRAL'` for neutral cards, otherwise the
   * single class the card belongs to.
   */
  class: HeroClass;
  /**
   * Card rarity string, matching `@hdt/hearthdb`. Only `'LEGENDARY'` is
   * meaningful for legality; other values are passed through unchanged.
   */
  rarity: string;
  /**
   * Card type string, matching `@hdt/hearthdb`. `'HERO'` is checked here to
   * reject Hero cards from the main deck slot.
   */
  type: string;
}

/**
 * Resolve a card id to its legality projection, or `null` if the card is
 * unknown. Pure synchronous lookup — implementations should pre-build a Map.
 */
export type CardLookup = (cardId: string) => CardLegalityInfo | null;

const TARGET_DECK_SIZE = 30 as const;

export function validateDeck(
  deck: Deck,
  cardLookup: CardLookup,
): { ok: boolean; issues: ValidityIssue[] } {
  const issues: ValidityIssue[] = [];

  const total = deck.cards.reduce((sum, c) => sum + c.count, 0);
  if (total < TARGET_DECK_SIZE) {
    issues.push({ kind: 'under-card-limit', required: TARGET_DECK_SIZE, actual: total });
  } else if (total > TARGET_DECK_SIZE) {
    issues.push({ kind: 'over-card-limit', required: TARGET_DECK_SIZE, actual: total });
  }

  for (const entry of deck.cards) {
    const info = cardLookup(entry.cardId);
    if (!info) continue;

    const isLegendary = info.rarity === 'LEGENDARY';
    if (isLegendary && entry.count > 1) {
      issues.push({ kind: 'legendary-over-limit', cardId: entry.cardId, count: entry.count });
    } else if (!isLegendary && entry.count > 2) {
      issues.push({ kind: 'over-copy-limit', cardId: entry.cardId, count: entry.count });
    }

    if (info.type === 'HERO') {
      issues.push({ kind: 'hero-in-main-deck', cardId: entry.cardId });
    }

    if (info.class !== 'NEUTRAL' && info.class !== deck.class) {
      issues.push({
        kind: 'off-class-card',
        cardId: entry.cardId,
        cardClass: info.class,
        deckClass: deck.class,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

export function aggregateCardCount(cards: DeckCard[]): number {
  return cards.reduce((sum, c) => sum + c.count, 0);
}
