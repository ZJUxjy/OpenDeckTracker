import type { DeckPositionExtractor } from './types';
import { waveshapingExtractor } from './extractors/waveshaping';

/**
 * Registered extractors. To add a new card that places cards at a
 * known deck position, append its extractor here. Snapshot field,
 * state machine, and renderer require no changes.
 */
export const DECK_POSITION_EXTRACTORS: readonly DeckPositionExtractor[] = [
  waveshapingExtractor,
];

const REGISTRY = new Map<string, DeckPositionExtractor>(
  DECK_POSITION_EXTRACTORS.map((e) => [e.triggerCardId, e]),
);

/**
 * Look up the extractor for a played card. Returns `undefined` for
 * cards without registered deck-position handling.
 */
export function getDeckPositionExtractor(
  cardId: string,
): DeckPositionExtractor | undefined {
  return REGISTRY.get(cardId);
}
