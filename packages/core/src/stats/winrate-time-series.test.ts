import { describe, expect, it } from 'vitest';
import type { MatchHistoryRecord, MatchResult } from './match-history';
import { computeWinrateTimeSeries } from './winrate-time-series';

function rec(endedAt: number, result: MatchResult, fingerprint = `f-${endedAt}`): MatchHistoryRecord {
  return {
    id: 0,
    fingerprint,
    startedAt: endedAt - 600_000,
    endedAt,
    durationSeconds: 600,
    result,
    playOrder: 'first',
    deckId: null,
    deckName: null,
    opponentName: null,
    opponentClass: null,
    gameType: 3,
    formatType: 2,
    source: 'deck-tracker',
  };
}

const dayMs = 24 * 60 * 60 * 1000;

describe('computeWinrateTimeSeries (daily)', () => {
  it('empty input returns empty array', () => {
    expect(computeWinrateTimeSeries([], 'daily')).toEqual([]);
  });

  it('two matches on same day produce one point with matches=2', () => {
    const t = Date.parse('2026-04-29T10:00:00Z');
    const points = computeWinrateTimeSeries(
      [rec(t, 'win', 'a'), rec(t + 3_600_000, 'loss', 'b')],
      'daily',
    );
    expect(points).toHaveLength(1);
    expect(points[0]?.matches).toBe(2);
    expect(points[0]?.wins).toBe(1);
    expect(points[0]?.losses).toBe(1);
    expect(points[0]?.winrate).toBe(50);
  });

  it('matches across two days produce two sorted points', () => {
    const day1 = Date.parse('2026-04-28T10:00:00Z');
    const day2 = Date.parse('2026-04-29T10:00:00Z');
    const points = computeWinrateTimeSeries([
      rec(day2, 'win', 'b'),
      rec(day1, 'win', 'a'),
    ]);
    expect(points).toHaveLength(2);
    expect(points[0]!.bucketStart).toBeLessThan(points[1]!.bucketStart);
  });

  it('unknown-result counted in matches but not wins/losses', () => {
    const t = Date.parse('2026-04-29T10:00:00Z');
    const points = computeWinrateTimeSeries(
      [rec(t, 'win', 'a'), rec(t + 1_000, 'unknown', 'u')],
      'daily',
    );
    expect(points[0]?.matches).toBe(2);
    expect(points[0]?.wins).toBe(1);
    expect(points[0]?.losses).toBe(0);
    expect(points[0]?.winrate).toBe(100);
  });

  it('all-unknown bucket has winrate=null', () => {
    const t = Date.parse('2026-04-29T10:00:00Z');
    const points = computeWinrateTimeSeries([rec(t, 'unknown', 'u')], 'daily');
    expect(points[0]?.winrate).toBe(null);
  });
});

describe('computeWinrateTimeSeries (weekly)', () => {
  it('Mon and Wed of same week collapse into one point (en-US, week starts Sunday)', () => {
    // Pick a Monday at 10:00 UTC and a Wednesday in the same week.
    const monday = Date.parse('2026-04-27T10:00:00Z'); // Monday
    const wednesday = monday + 2 * dayMs;
    const points = computeWinrateTimeSeries(
      [rec(monday, 'win', 'm'), rec(wednesday, 'loss', 'w')],
      'weekly',
      'en-US',
    );
    expect(points).toHaveLength(1);
    expect(points[0]?.matches).toBe(2);
  });

  it('zh-CN weekly bucket starts on Monday', () => {
    const sunday = Date.parse('2026-04-26T10:00:00Z'); // Sunday
    const monday = sunday + 1 * dayMs;
    const points = computeWinrateTimeSeries(
      [rec(sunday, 'win', 's'), rec(monday, 'win', 'm')],
      'weekly',
      'zh-CN',
    );
    // Sunday belongs to the previous week (which started the prior Monday)
    // and Monday starts a new week → two distinct points.
    expect(points).toHaveLength(2);
  });
});
