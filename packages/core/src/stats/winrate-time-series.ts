import type { MatchHistoryRecord } from './match-history';

export type TimeSeriesGranularity = 'daily' | 'weekly';

export interface WinrateTimeSeriesPoint {
  /** Bucket-start timestamp (ms since epoch, host-local-midnight aligned). */
  bucketStart: number;
  wins: number;
  losses: number;
  /** Percent winrate over known-result matches in this bucket; `null` when zero. */
  winrate: number | null;
  /** Total matches in the bucket (incl. unknown-result). */
  matches: number;
}

/** Round a timestamp to the start of its local-midnight day. */
function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Round to the start of the locale-conventional first day of the week.
 * For `en-US` this is Sunday (weekday 0); for `zh-CN` this is Monday (1).
 * Defaults to `en-US` (Sunday) if unspecified.
 */
function startOfLocalWeek(ts: number, locale: 'en-US' | 'zh-CN'): number {
  const dayStart = startOfLocalDay(ts);
  const d = new Date(dayStart);
  const weekday = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const firstDayOfWeek = locale === 'zh-CN' ? 1 : 0;
  const offsetDays = (weekday - firstDayOfWeek + 7) % 7;
  d.setDate(d.getDate() - offsetDays);
  return d.getTime();
}

export function computeWinrateTimeSeries(
  matches: MatchHistoryRecord[],
  granularity: TimeSeriesGranularity = 'daily',
  locale: 'en-US' | 'zh-CN' = 'en-US',
): WinrateTimeSeriesPoint[] {
  const buckets = new Map<number, WinrateTimeSeriesPoint>();

  for (const m of matches) {
    const bucketStart =
      granularity === 'daily'
        ? startOfLocalDay(m.endedAt)
        : startOfLocalWeek(m.endedAt, locale);

    const point =
      buckets.get(bucketStart) ??
      ({ bucketStart, wins: 0, losses: 0, winrate: null, matches: 0 } as WinrateTimeSeriesPoint);
    point.matches += 1;
    if (m.result === 'win') point.wins += 1;
    else if (m.result === 'loss') point.losses += 1;
    buckets.set(bucketStart, point);
  }

  const points = Array.from(buckets.values()).sort((a, b) => a.bucketStart - b.bucketStart);
  for (const p of points) {
    const known = p.wins + p.losses;
    p.winrate = known === 0 ? null : Math.round((p.wins / known) * 1000) / 10;
  }
  return points;
}
