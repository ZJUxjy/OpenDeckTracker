export interface ResourceGroup {
  id: string;
  name: string;
  cardIds: string[];
}

export interface ResourceSummaryInput {
  cardIds: readonly string[];
  deck: readonly { cardId: string; count: number }[];
  observed: readonly { entityId: number; cardId: string; created: boolean }[];
  hand?: readonly string[];
  remaining?: readonly { cardId: string; count: number }[];
  predicted: boolean;
}

export function summarizeResources(input: ResourceSummaryInput) {
  const targets = new Set(input.cardIds);
  const observations = [...new Map(input.observed.map(card => [card.entityId, card])).values()]
    .filter(card => targets.has(card.cardId));
  const observedOriginal = observations.filter(card => !card.created).length;
  const observedGenerated = observations.filter(card => card.created).length;
  const countEntries = (cards: readonly { cardId: string; count: number }[]) =>
    cards.reduce((sum, card) => sum + (targets.has(card.cardId) ? Math.max(0, card.count) : 0), 0);
  const predictedUnplayed = input.predicted ? input.deck.reduce((sum, card) => {
    if (!targets.has(card.cardId)) return sum;
    return sum + Math.max(0, card.count - observations.filter(played => played.cardId === card.cardId && !played.created).length);
  }, 0) : null;
  return { observedOriginal, observedGenerated, predictedUnplayed,
    inHand: input.hand === undefined ? null : input.hand.filter(id => targets.has(id)).length,
    inDeck: input.remaining === undefined ? null : countEntries(input.remaining) };
}
