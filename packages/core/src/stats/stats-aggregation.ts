import type { MatchHistoryRecord, StatsTimeFilter } from './match-history';

export interface StatsQueryOptions {
  filter: StatsTimeFilter;
  now?: Date;
  recentLimit?: number;
}

export interface ClassWinrate {
  className: string;
  wins: number;
  losses: number;
  winrate: number | null;
}

export interface BestDeckStats {
  deckId: number | null;
  deckName: string;
  wins: number;
  losses: number;
  matchesPlayed: number;
  winrate: number | null;
}

export type RecentMatchView = MatchHistoryRecord;

export interface StatsSummary {
  matchesPlayed: number;
  wins: number;
  losses: number;
  overallWinrate: number | null;
  timePlayedSeconds: number;
  averageDurationSeconds: number | null;
  bestDeck: BestDeckStats | null;
  classWinrates: ClassWinrate[];
  recentMatches: RecentMatchView[];
}

export function aggregateStats(
  records: readonly MatchHistoryRecord[],
  options: StatsQueryOptions,
): StatsSummary {
  const filtered = filterMatchesByTime(records, options);
  const wins = filtered.filter((record) => record.result === 'win').length;
  const losses = filtered.filter((record) => record.result === 'loss').length;
  const timePlayedSeconds = filtered.reduce((total, record) => total + record.durationSeconds, 0);
  const recentLimit = options.recentLimit ?? 5;

  return {
    matchesPlayed: filtered.length,
    wins,
    losses,
    overallWinrate: winrate(wins, losses),
    timePlayedSeconds,
    averageDurationSeconds:
      filtered.length === 0 ? null : Math.round(timePlayedSeconds / filtered.length),
    bestDeck: bestDeck(filtered),
    classWinrates: classWinrates(filtered),
    recentMatches: [...filtered]
      .sort((a, b) => b.endedAt - a.endedAt)
      .slice(0, recentLimit),
  };
}

export function filterMatchesByTime(
  records: readonly MatchHistoryRecord[],
  options: Pick<StatsQueryOptions, 'filter' | 'now'>,
): MatchHistoryRecord[] {
  if (options.filter === 'all-time') return [...records];

  const now = options.now ?? new Date();
  const start = startTimestamp(options.filter, now);
  return records.filter((record) => record.endedAt >= start && record.endedAt <= now.getTime());
}

function classWinrates(records: readonly MatchHistoryRecord[]): ClassWinrate[] {
  const byClass = new Map<string, { wins: number; losses: number }>();
  for (const record of records) {
    if (record.result === 'unknown' || record.opponentClass === null) continue;
    const current = byClass.get(record.opponentClass) ?? { wins: 0, losses: 0 };
    if (record.result === 'win') current.wins += 1;
    if (record.result === 'loss') current.losses += 1;
    byClass.set(record.opponentClass, current);
  }

  return [...byClass.entries()]
    .map(([className, stats]) => ({
      className,
      wins: stats.wins,
      losses: stats.losses,
      winrate: winrate(stats.wins, stats.losses),
    }))
    .sort((a, b) => a.className.localeCompare(b.className));
}

function bestDeck(records: readonly MatchHistoryRecord[]): BestDeckStats | null {
  const byDeck = new Map<string, BestDeckStats>();
  for (const record of records) {
    if (record.result === 'unknown' || record.deckName === null) continue;
    const key = `${record.deckId ?? 'unknown'}:${record.deckName}`;
    const current = byDeck.get(key) ?? {
      deckId: record.deckId,
      deckName: record.deckName,
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
      winrate: null,
    };
    current.matchesPlayed += 1;
    if (record.result === 'win') current.wins += 1;
    if (record.result === 'loss') current.losses += 1;
    current.winrate = winrate(current.wins, current.losses);
    byDeck.set(key, current);
  }

  const decks = [...byDeck.values()];
  decks.sort((a, b) => {
    const winrateDelta = (b.winrate ?? -1) - (a.winrate ?? -1);
    if (winrateDelta !== 0) return winrateDelta;
    return b.matchesPlayed - a.matchesPlayed;
  });
  return decks[0] ?? null;
}

function winrate(wins: number, losses: number): number | null {
  const known = wins + losses;
  if (known === 0) return null;
  return Math.round((wins / known) * 1000) / 10;
}

function startTimestamp(filter: Exclude<StatsTimeFilter, 'all-time'>, now: Date): number {
  if (filter === 'week') return now.getTime() - 7 * 24 * 60 * 60 * 1000;
  if (filter === 'season') {
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  }
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}
