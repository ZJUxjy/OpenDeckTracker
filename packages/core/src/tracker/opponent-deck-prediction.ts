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
  /**
   * Optional per-card class resolver. When provided, observed cards
   * whose class is non-`NEUTRAL` and disagrees with `opponentClass`
   * are dropped from the matching multiset — they cannot legally be
   * in the opponent's constructed deck, so they must have come from a
   * Discover / Generate / random-create effect even if the
   * HearthWatcher origin classifier failed to flag them. Returning
   * `null` means "unknown / not in the renderer's CardDb yet" and the
   * card is kept (conservative default).
   */
  cardClassResolver?: (cardId: string) => HeroClass | null;
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
 * The Hearthstone "coin" handed to whoever is going second is not part
 * of any deckstring. If the opponent plays it, ignoring it is the right
 * default — including it would lower every candidate's score by 1/N
 * and inflate the denominator in `confidence`. Mirrors the suppression
 * already done by `isDeckIdentityCardId` for friendly deck identification.
 */
function isCoinLikeCard(cardId: string): boolean {
  if (cardId === 'GAME_005') return true;
  if (cardId.endsWith('_COIN')) return true;
  if (cardId.includes('COIN')) return true;
  return false;
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

  // Build the observed multiset of non-created, non-coin, in-class cards.
  const observed = new Map<string, number>();
  let observedOriginalCount = 0;
  let offClassDropped = 0;
  for (const card of input.observedCards) {
    if (card.created) continue;
    if (isCoinLikeCard(card.cardId)) continue;
    if (input.opponentClass !== null && input.cardClassResolver) {
      const cardClass = input.cardClassResolver(card.cardId);
      if (cardClass !== null && cardClass !== 'NEUTRAL' && cardClass !== input.opponentClass) {
        // Off-class: cannot be in the opponent's constructed deck, so it
        // must be created (the heuristic origin classifier missed it).
        offClassDropped++;
        continue;
      }
    }
    observed.set(card.cardId, (observed.get(card.cardId) ?? 0) + 1);
    observedOriginalCount++;
  }
  // `offClassDropped` is intentionally accumulated but not surfaced —
  // the renderer derives its own "excluded created cards" count from
  // `OpponentCardRecord.created` for UI display, and the prediction
  // contract is "what fits the candidates after filters." Keeping the
  // local for clarity / future "diagnostics" metric.
  void offClassDropped;
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
