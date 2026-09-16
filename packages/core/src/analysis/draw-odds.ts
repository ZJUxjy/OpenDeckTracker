export interface DrawOddsInput {
  remaining: readonly { cardId: string; count: number }[];
  targets: readonly string[];
  draws: number;
  mode?: 'any' | 'all';
  /** When supplied, existing hand copies count toward the selected goal. */
  held?: readonly string[];
  observedDeckSize?: number;
  knownPositions?: readonly { cardId: string; placement: 'top' | 'bottom'; insertedAt: number }[];
}

export interface DrawOddsResult {
  status: 'ready' | 'no-targets' | 'inconsistent';
  probability: number | null;
  deckSize: number;
  draws: number;
  targetCopies: number;
}

/** Exact sampling without replacement. Known positions use the tracker insertion order. */
export function calculateDrawOdds(input: DrawOddsInput): DrawOddsResult {
  const counts = new Map<string, number>();
  let valid = Number.isSafeInteger(input.draws) && input.draws >= 0;
  for (const entry of input.remaining) {
    valid &&= Number.isSafeInteger(entry.count) && entry.count >= 0 && entry.cardId.length > 0;
    counts.set(entry.cardId, (counts.get(entry.cardId) ?? 0) + entry.count);
  }
  const deckSize = [...counts.values()].reduce((sum, count) => sum + count, 0);
  // Bound malformed inputs before allocating DP arrays or doing expensive arithmetic.
  valid &&= Number.isSafeInteger(deckSize) && deckSize <= 1000;
  if (input.observedDeckSize !== undefined) valid &&= input.observedDeckSize === deckSize;
  const targets = [...new Set(input.targets.filter(Boolean))];
  const targetCopies = targets.reduce((sum, id) => sum + (counts.get(id) ?? 0), 0);
  const draws = valid ? Math.min(deckSize, input.draws) : 0;
  const result = (status: DrawOddsResult['status'], probability: number | null): DrawOddsResult =>
    ({ status, probability, deckSize, draws, targetCopies });
  if (!valid) return result('inconsistent', null);

  const positions = [...(input.knownPositions ?? [])].sort((a, b) => a.insertedAt - b.insertedAt);
  for (const position of positions) {
    const count = counts.get(position.cardId) ?? 0;
    if (count <= 0 || !Number.isFinite(position.insertedAt)) return result('inconsistent', null);
    counts.set(position.cardId, count - 1);
  }
  if (!targets.length) return result('no-targets', null);
  const top = positions.filter(p => p.placement === 'top');
  const bottom = positions.filter(p => p.placement === 'bottom');
  const randomSize = deckSize - positions.length;
  const randomDraws = Math.min(randomSize, Math.max(0, draws - top.length));
  const fixed = new Set([
    ...(input.held ?? []),
    ...top.slice(0, draws).map(p => p.cardId),
    ...bottom.slice(0, Math.max(0, draws - top.length - randomSize)).map(p => p.cardId),
  ]);
  const missing = targets.filter(id => !fixed.has(id));
  if (input.mode !== 'all') {
    if (missing.length < targets.length) return result('ready', 1);
    const hits = targets.reduce((sum, id) => sum + (counts.get(id) ?? 0), 0);
    if (!hits || !randomDraws) return result('ready', 0);
    if (randomDraws > randomSize - hits) return result('ready', 1);
    let logMiss = 0;
    for (let i = 0; i < randomDraws; i++) logMiss += Math.log1p(-hits / (randomSize - i));
    return result('ready', -Math.expm1(logMiss));
  }
  if (!missing.length) return result('ready', 1);
  if (missing.length > randomDraws || missing.some(id => !counts.get(id))) return result('ready', 0);

  // Sequential multivariate hypergeometric distribution. dp[r] is the mass of
  // successful target groups so far with r draw slots left for remaining groups.
  const logFactorials = [0];
  for (let n = 1; n <= randomSize; n++) logFactorials[n] = logFactorials[n - 1]! + Math.log(n);
  const logChoose = (n: number, k: number): number =>
    logFactorials[n]! - logFactorials[k]! - logFactorials[n - k]!;
  let dp = new Map([[randomDraws, 1]]);
  let population = randomSize;
  for (const id of missing) {
    const copies = counts.get(id)!;
    const next = new Map<number, number>();
    for (const [slots, mass] of dp) {
      for (let taken = Math.max(1, slots - (population - copies)); taken <= Math.min(copies, slots); taken++) {
        const probability = Math.exp(logChoose(copies, taken)
          + logChoose(population - copies, slots - taken) - logChoose(population, slots));
        next.set(slots - taken, (next.get(slots - taken) ?? 0) + mass * probability);
      }
    }
    population -= copies;
    dp = next;
  }
  return result('ready', Math.max(0, Math.min(1, [...dp.values()].reduce((sum, value) => sum + value, 0))));
}
