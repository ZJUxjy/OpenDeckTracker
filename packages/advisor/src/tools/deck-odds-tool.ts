import type { KnownDeckPosition } from '@hdt/core';

export interface DeckOddsCount {
  cardId: string;
  count: number;
}

export interface DeckOddsInput {
  remaining: readonly DeckOddsCount[];
  targetCardIds: readonly string[];
  draws: number;
  knownPositions?: readonly KnownDeckPosition[];
}

export interface DeckOddsResult {
  probability: number;
  deckSize: number;
  targetCopies: number;
  draws: number;
}

export function computeDeckOdds(input: DeckOddsInput): DeckOddsResult {
  const targets = new Set(input.targetCardIds);
  const counts = countRemaining(input.remaining);
  const deckSize = totalCount(counts);
  const targetCopies = countTargets(counts, targets);
  const draws = clampDraws(input.draws, deckSize);

  if (draws === 0 || deckSize === 0 || targetCopies === 0) {
    return { probability: 0, deckSize, targetCopies, draws };
  }

  const top = sortedKnown(input.knownPositions, 'top');
  const bottom = sortedKnown(input.knownPositions, 'bottom');

  let randomDeckSize = deckSize;
  let randomTargetCopies = targetCopies;
  let remainingDraws = draws;

  for (const known of top) {
    if (remainingDraws === 0) {
      return { probability: 0, deckSize, targetCopies, draws };
    }
    const wasPresent = decrement(counts, known.cardId);
    if (wasPresent) {
      randomDeckSize -= 1;
      if (targets.has(known.cardId)) randomTargetCopies -= 1;
    }
    if (targets.has(known.cardId)) {
      return { probability: 1, deckSize, targetCopies, draws };
    }
    remainingDraws -= 1;
  }

  if (remainingDraws === 0) {
    return { probability: 0, deckSize, targetCopies, draws };
  }

  for (const known of bottom) {
    const wasPresent = decrement(counts, known.cardId);
    if (!wasPresent) continue;
    randomDeckSize -= 1;
    if (targets.has(known.cardId)) randomTargetCopies -= 1;
  }

  const drawsFromRandom = Math.min(remainingDraws, randomDeckSize);
  const bottomDraws = Math.max(0, remainingDraws - randomDeckSize);
  if (bottomDraws > 0 && bottom.slice(0, bottomDraws).some((known) => targets.has(known.cardId))) {
    return { probability: 1, deckSize, targetCopies, draws };
  }

  return {
    probability: probabilityAtLeastOne(randomDeckSize, randomTargetCopies, drawsFromRandom),
    deckSize,
    targetCopies,
    draws,
  };
}

function countRemaining(entries: readonly DeckOddsCount[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const count = Math.max(0, Math.floor(entry.count));
    if (count === 0) continue;
    counts.set(entry.cardId, (counts.get(entry.cardId) ?? 0) + count);
  }
  return counts;
}

function totalCount(counts: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const count of counts.values()) total += count;
  return total;
}

function countTargets(counts: ReadonlyMap<string, number>, targets: ReadonlySet<string>): number {
  let total = 0;
  for (const target of targets) total += counts.get(target) ?? 0;
  return total;
}

function clampDraws(draws: number, deckSize: number): number {
  if (!Number.isFinite(draws)) return 0;
  return Math.max(0, Math.min(deckSize, Math.floor(draws)));
}

function sortedKnown(
  knownPositions: readonly KnownDeckPosition[] | undefined,
  placement: KnownDeckPosition['placement'],
): KnownDeckPosition[] {
  return (knownPositions ?? [])
    .filter((known) => known.placement === placement)
    .slice()
    .sort((a, b) => a.insertedAt - b.insertedAt);
}

function decrement(counts: Map<string, number>, cardId: string): boolean {
  const current = counts.get(cardId) ?? 0;
  if (current <= 0) return false;
  if (current === 1) counts.delete(cardId);
  else counts.set(cardId, current - 1);
  return true;
}

function probabilityAtLeastOne(deckSize: number, targetCopies: number, draws: number): number {
  if (draws <= 0 || deckSize <= 0 || targetCopies <= 0) return 0;
  if (draws >= deckSize) return targetCopies > 0 ? 1 : 0;

  const nonTargets = deckSize - targetCopies;
  if (nonTargets <= 0) return 1;
  if (draws > nonTargets) return 1;

  let missProbability = 1;
  for (let i = 0; i < draws; i += 1) {
    missProbability *= (nonTargets - i) / (deckSize - i);
  }
  return 1 - missProbability;
}
