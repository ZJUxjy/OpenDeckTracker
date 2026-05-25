import { describe, expect, it } from 'vitest';
import type { MatchHistoryRecord } from './match-history';
import { aggregateStats, filterMatchesByTime } from './stats-aggregation';

const fixedNow = new Date('2026-04-27T12:00:00Z');

const makeRecord = (overrides: Partial<MatchHistoryRecord> = {}): MatchHistoryRecord => ({
  id: 1,
  fingerprint: 'fp-1',
  startedAt: Date.parse('2026-04-27T10:00:00Z'),
  endedAt: Date.parse('2026-04-27T10:10:00Z'),
  durationSeconds: 600,
  result: 'win',
  playOrder: 'first',
  deckId: 42,
  deckName: 'Recorded Real Deck',
  opponentName: 'Opponent',
  opponentClass: 'Mage',
  gameType: 3,
  formatType: 2,
  source: 'deck-tracker',
  ...overrides,
});

describe('stats aggregation', () => {
  it('returns empty stats for empty history', () => {
    expect(aggregateStats([], { filter: 'season', now: fixedNow })).toMatchObject({
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      overallWinrate: null,
      recentMatches: [],
      classWinrates: [],
      bestDeck: null,
    });
  });

  it('ignores unknown results in winrate denominator', () => {
    const summary = aggregateStats(
      [
        makeRecord({ id: 1, fingerprint: 'win', result: 'win' }),
        makeRecord({ id: 2, fingerprint: 'loss', result: 'loss' }),
        makeRecord({ id: 3, fingerprint: 'unknown', result: 'unknown' }),
      ],
      { filter: 'all-time', now: fixedNow },
    );

    expect(summary.matchesPlayed).toBe(3);
    expect(summary.wins).toBe(1);
    expect(summary.losses).toBe(1);
    expect(summary.overallWinrate).toBe(50);
  });

  it('returns recent matches newest first', () => {
    const summary = aggregateStats(
      [
        makeRecord({ id: 1, fingerprint: 'older', endedAt: 1000 }),
        makeRecord({ id: 2, fingerprint: 'newest', endedAt: 3000 }),
        makeRecord({ id: 3, fingerprint: 'middle', endedAt: 2000 }),
      ],
      { filter: 'all-time', now: fixedNow },
    );

    expect(summary.recentMatches.map((match) => match.id)).toEqual([2, 3, 1]);
  });

  it('computes best deck and class winrates from known-result matches', () => {
    const summary = aggregateStats(
      [
        makeRecord({ id: 1, fingerprint: 'a', deckName: 'Deck A', opponentClass: 'Mage', result: 'win' }),
        makeRecord({ id: 2, fingerprint: 'b', deckName: 'Deck A', opponentClass: 'Mage', result: 'loss' }),
        makeRecord({ id: 3, fingerprint: 'c', deckName: 'Deck B', opponentClass: 'Rogue', result: 'win' }),
        makeRecord({ id: 4, fingerprint: 'd', deckName: 'Deck B', opponentClass: 'Rogue', result: 'win' }),
      ],
      { filter: 'all-time', now: fixedNow },
    );

    expect(summary.bestDeck).toMatchObject({ deckName: 'Deck B', wins: 2, losses: 0, winrate: 100 });
    expect(summary.classWinrates).toEqual([
      { className: 'Mage', wins: 1, losses: 1, winrate: 50 },
      { className: 'Rogue', wins: 2, losses: 0, winrate: 100 },
    ]);
  });

  it('filters today and all-time windows', () => {
    const today = makeRecord({ id: 1, endedAt: Date.parse('2026-04-27T02:00:00Z') });
    const yesterday = makeRecord({ id: 2, endedAt: Date.parse('2026-04-26T23:00:00Z') });

    expect(filterMatchesByTime([today, yesterday], { filter: 'today', now: fixedNow })).toEqual([
      today,
    ]);
    expect(filterMatchesByTime([today, yesterday], { filter: 'all-time', now: fixedNow })).toHaveLength(2);
  });

  it('does not include optional aggregations when no flags are set', () => {
    const summary = aggregateStats([makeRecord()], { filter: 'all-time', now: fixedNow });
    expect(summary.matchupMatrix).toBeUndefined();
    expect(summary.winrateTimeSeries).toBeUndefined();
    expect(summary.playOrderSplit).toBeUndefined();
  });

  it('populates matchupMatrix when includeMatchupMatrix is true', () => {
    const r = makeRecord({ playerClass: 'DRUID', opponentClass: 'MAGE' });
    const summary = aggregateStats([r], {
      filter: 'all-time',
      now: fixedNow,
      includeMatchupMatrix: true,
    });
    expect(summary.matchupMatrix?.cells.DRUID?.MAGE).toEqual({
      wins: 1,
      losses: 0,
      winrate: 100,
    });
  });

  it('populates winrateTimeSeries when includeTimeSeries is true', () => {
    const r = makeRecord();
    const summary = aggregateStats([r], {
      filter: 'all-time',
      now: fixedNow,
      includeTimeSeries: true,
    });
    expect(summary.winrateTimeSeries).toBeDefined();
    expect(summary.winrateTimeSeries?.length).toBe(1);
  });

  it('populates playOrderSplit when includePlayOrderSplit is true', () => {
    const a = makeRecord({ playOrder: 'first', result: 'win', fingerprint: 'a' });
    const b = makeRecord({ playOrder: 'coin', result: 'loss', fingerprint: 'b' });
    const summary = aggregateStats([a, b], {
      filter: 'all-time',
      now: fixedNow,
      includePlayOrderSplit: true,
    });
    expect(summary.playOrderSplit?.first.wins).toBe(1);
    expect(summary.playOrderSplit?.coin.losses).toBe(1);
  });

  it('formatFilter narrows ALL aggregations including summary', () => {
    const standard = makeRecord({ id: 1, formatType: 2, fingerprint: 'std', result: 'win' });
    const wild = makeRecord({ id: 2, formatType: 1, fingerprint: 'wild', result: 'loss' });
    const summary = aggregateStats([standard, wild], {
      filter: 'all-time',
      now: fixedNow,
      formatFilter: 'standard',
      includeMatchupMatrix: true,
      includePlayOrderSplit: true,
    });
    expect(summary.matchesPlayed).toBe(1);
    expect(summary.wins).toBe(1);
    expect(summary.losses).toBe(0);
    expect(summary.recentMatches).toHaveLength(1);
    expect(summary.recentMatches[0]?.fingerprint).toBe('std');
    expect(Object.keys(summary.matchupMatrix?.cells ?? {}).length).toBe(1);
    expect(summary.playOrderSplit?.first.wins).toBe(1);
    expect(summary.playOrderSplit?.coin.losses).toBe(0);
  });

  it('matchModeFilter narrows all aggregations including recent matches', () => {
    const ranked = makeRecord({
      id: 1,
      fingerprint: 'ranked',
      result: 'win',
      matchMode: 'ranked',
    } as Partial<MatchHistoryRecord>);
    const casual = makeRecord({
      id: 2,
      fingerprint: 'casual',
      result: 'loss',
      matchMode: 'casual',
    } as Partial<MatchHistoryRecord>);
    const summary = aggregateStats([ranked, casual], {
      filter: 'all-time',
      now: fixedNow,
      matchModeFilter: 'ranked',
      includePlayOrderSplit: true,
    });

    expect(summary.matchesPlayed).toBe(1);
    expect(summary.wins).toBe(1);
    expect(summary.losses).toBe(0);
    expect(summary.recentMatches.map((match) => match.fingerprint)).toEqual(['ranked']);
    expect(summary.playOrderSplit?.first.wins).toBe(1);
  });
});
