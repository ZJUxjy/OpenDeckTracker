import { filterMatchesByTime } from './stats-aggregation';
import { filterMatchesByFormat, type FormatFilter } from './format-filter';
import type { MatchHistoryRecord, StatsTimeFilter } from './match-history';

export interface SavedDeckMatchupStats {
  opponentClass: string;
  wins: number;
  losses: number;
  /** Wins + losses + unknown matches that survived the filters. */
  matchesPlayed: number;
  /** Percent winrate over `wins + losses`; `null` when zero known. */
  winrate: number | null;
}

export interface SavedDeckMatchupOptions {
  filter: StatsTimeFilter;
  now?: Date;
  formatFilter?: FormatFilter;
}

const UNKNOWN_OPPONENT_KEY = 'Unknown';

/**
 * Aggregate persisted match-history rows into per-opponent-class buckets
 * for a single saved deck. Records whose `savedDeckId` does not match
 * `savedDeckId` are excluded; null opponent classes are bucketed under
 * the literal `'Unknown'` so renderers can still surface them.
 */
export function computeSavedDeckMatchups(
  records: readonly MatchHistoryRecord[],
  savedDeckId: string,
  options: SavedDeckMatchupOptions,
): SavedDeckMatchupStats[] {
  const filtered = filterMatchesByFormat(
    filterMatchesByTime([...records], {
      filter: options.filter,
      ...(options.now !== undefined ? { now: options.now } : {}),
    }),
    options.formatFilter ?? 'all',
  );

  const buckets = new Map<string, SavedDeckMatchupStats>();
  for (const m of filtered) {
    if (m.savedDeckId !== savedDeckId) continue;
    const key = m.opponentClass ?? UNKNOWN_OPPONENT_KEY;
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = {
        opponentClass: key,
        wins: 0,
        losses: 0,
        matchesPlayed: 0,
        winrate: null,
      };
      buckets.set(key, bucket);
    }
    bucket.matchesPlayed += 1;
    if (m.result === 'win') bucket.wins += 1;
    else if (m.result === 'loss') bucket.losses += 1;
  }

  const result = [...buckets.values()];
  for (const b of result) {
    const known = b.wins + b.losses;
    b.winrate = known === 0 ? null : Math.round((b.wins / known) * 1000) / 10;
  }
  result.sort((a, b) => a.opponentClass.localeCompare(b.opponentClass));
  return result;
}
