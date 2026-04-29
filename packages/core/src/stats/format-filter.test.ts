import { describe, expect, it } from 'vitest';
import type { MatchHistoryRecord } from './match-history';
import { filterMatchesByFormat } from './format-filter';

function rec(formatType: number, fingerprint = `f-${formatType}`): MatchHistoryRecord {
  return {
    id: 0,
    fingerprint,
    startedAt: 0,
    endedAt: 0,
    durationSeconds: 0,
    result: 'win',
    playOrder: 'first',
    deckId: null,
    deckName: null,
    opponentName: null,
    opponentClass: null,
    gameType: 3,
    formatType,
    source: 'deck-tracker',
  };
}

describe('filterMatchesByFormat', () => {
  it("'all' returns the input list unchanged", () => {
    const matches = [rec(1), rec(2), rec(3), rec(4)];
    expect(filterMatchesByFormat(matches, 'all')).toBe(matches);
  });

  it("'standard' keeps only formatType=2", () => {
    const matches = [rec(1), rec(2), rec(3), rec(4), rec(2, 'std-extra')];
    const filtered = filterMatchesByFormat(matches, 'standard');
    expect(filtered.map((m) => m.fingerprint)).toEqual(['f-2', 'std-extra']);
  });

  it("'wild' keeps only formatType=1", () => {
    const matches = [rec(1), rec(2), rec(3)];
    expect(filterMatchesByFormat(matches, 'wild').map((m) => m.formatType)).toEqual([1]);
  });

  it("'classic' keeps only formatType=3", () => {
    const matches = [rec(1), rec(2), rec(3)];
    expect(filterMatchesByFormat(matches, 'classic').map((m) => m.formatType)).toEqual([3]);
  });

  it("'twist' keeps only formatType=4", () => {
    const matches = [rec(2), rec(4), rec(4, 'twist-2')];
    expect(filterMatchesByFormat(matches, 'twist').map((m) => m.fingerprint)).toEqual([
      'f-4',
      'twist-2',
    ]);
  });

  it('empty input returns empty', () => {
    expect(filterMatchesByFormat([], 'standard')).toEqual([]);
  });

  it('non-matching format returns empty array', () => {
    const matches = [rec(2), rec(2)];
    expect(filterMatchesByFormat(matches, 'wild')).toEqual([]);
  });
});
