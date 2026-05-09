import type { Format, HeroClass, PopularDeckEnriched } from '../deck/deck-types';

export interface PredictionInput {
  observedCards: ReadonlyArray<{ cardId: string; created: boolean }>;
  opponentClass: HeroClass | null;
  format: Format | null;
  candidates: ReadonlyArray<PopularDeckEnriched>;
  /**
   * Decode a deckstring into a `Map<cardId, count>`. Returns `null`
   * when the deckstring fails to decode (host injects this — core
   * stays runtime-neutral and avoids depending on `@hdt/hearthdb`).
   */
  deckCardLookup: (deckstring: string) => ReadonlyMap<string, number> | null;
  /** Default 5. */
  topN?: number;
}

export type PredictionConfidence = 'low' | 'medium' | 'high';

export interface OpponentDeckPrediction {
  deck: PopularDeckEnriched;
  /** 0..1 — observation-coverage variant of IoU. */
  score: number;
  /** Σ min(observed[c], deck[c]) over the observed multiset. */
  matchedCount: number;
  /** Total non-created observed cards (denominator of `score`). */
  observedOriginalCount: number;
  confidence: PredictionConfidence;
}

const DEFAULT_TOP_N = 5;

function classifyConfidence(observedOriginalCount: number): PredictionConfidence {
  if (observedOriginalCount < 5) return 'low';
  if (observedOriginalCount < 10) return 'medium';
  return 'high';
}

/**
 * Predict the opponent's most-likely popular decks given their observed
 * plays. Excludes Discover / Generate cards (`created: true`) from the
 * matching multiset to avoid pollution. Returns at most `topN` entries
 * (default 5), ordered by score desc with `gamesCount` desc as tiebreaker.
 *
 * Pure: no I/O, no console output, deterministic on input. Decoding of
 * deckstrings is delegated to the caller-supplied `deckCardLookup` so
 * core stays runtime-neutral.
 */
export function predictOpponentDecks(
  input: PredictionInput,
): OpponentDeckPrediction[] {
  const topN = input.topN ?? DEFAULT_TOP_N;

  // Build the observed multiset of non-created cards.
  const observed = new Map<string, number>();
  let observedOriginalCount = 0;
  for (const card of input.observedCards) {
    if (card.created) continue;
    observed.set(card.cardId, (observed.get(card.cardId) ?? 0) + 1);
    observedOriginalCount++;
  }
  if (observedOriginalCount === 0) return [];

  // Filter candidates by class / format.
  const filtered = input.candidates.filter((deck) => {
    if (input.opponentClass !== null && deck.class !== input.opponentClass) return false;
    if (input.format !== null && deck.format !== input.format) return false;
    return true;
  });

  const confidence = classifyConfidence(observedOriginalCount);
  const denominator = Math.max(1, observedOriginalCount);

  const results: OpponentDeckPrediction[] = [];
  for (const deck of filtered) {
    const deckCounts = input.deckCardLookup(deck.deckstring);
    if (deckCounts === null) continue;
    let matched = 0;
    for (const [cardId, observedCount] of observed) {
      const deckCount = deckCounts.get(cardId) ?? 0;
      matched += Math.min(observedCount, deckCount);
    }
    results.push({
      deck,
      score: matched / denominator,
      matchedCount: matched,
      observedOriginalCount,
      confidence,
    });
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.deck.gamesCount - a.deck.gamesCount;
  });

  return results.slice(0, topN);
}
