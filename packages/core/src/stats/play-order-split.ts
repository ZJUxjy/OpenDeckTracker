import type { MatchHistoryRecord } from './match-history';

export interface PlayOrderBucket {
  wins: number;
  losses: number;
  /** Percent winrate over known-result matches in this bucket; `null` when zero. */
  winrate: number | null;
}

export interface PlayOrderSplit {
  first: PlayOrderBucket;
  coin: PlayOrderBucket;
  unknown: PlayOrderBucket;
}

function emptyBucket(): PlayOrderBucket {
  return { wins: 0, losses: 0, winrate: null };
}

export function computePlayOrderSplit(matches: MatchHistoryRecord[]): PlayOrderSplit {
  const split: PlayOrderSplit = {
    first: emptyBucket(),
    coin: emptyBucket(),
    unknown: emptyBucket(),
  };
  for (const m of matches) {
    const bucket = split[m.playOrder];
    if (!bucket) continue;
    if (m.result === 'win') bucket.wins += 1;
    else if (m.result === 'loss') bucket.losses += 1;
    // unknown-result matches don't count toward wins/losses
  }
  for (const key of ['first', 'coin', 'unknown'] as const) {
    const bucket = split[key];
    const known = bucket.wins + bucket.losses;
    bucket.winrate = known === 0 ? null : Math.round((bucket.wins / known) * 1000) / 10;
  }
  return split;
}
