import type { HearthWatcherEntity, OriginalDeckCard } from './hearthwatcher-game-state';

export function countOriginalDeck(cards: readonly OriginalDeckCard[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) {
    counts.set(card.cardId, (counts.get(card.cardId) ?? 0) + card.count);
  }
  return counts;
}

export function isOriginalEntity(entity: HearthWatcherEntity): boolean {
  return entity.info.originalController !== undefined && entity.info.created !== true;
}
