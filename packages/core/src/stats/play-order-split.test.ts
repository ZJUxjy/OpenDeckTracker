import { describe, expect, it } from 'vitest';
import type { MatchHistoryRecord, MatchResult, PlayOrder } from './match-history';
import { computePlayOrderSplit } from './play-order-split';

function rec(playOrder: PlayOrder, result: MatchResult, fingerprint = `f-${Math.random()}`): MatchHistoryRecord {
  return {
    id: 0,
    fingerprint,
    startedAt: 0,
    endedAt: 0,
    durationSeconds: 0,
    result,
    playOrder,
    deckId: null,
    deckName: null,
    opponentName: null,
    opponentClass: null,
    gameType: 3,
    formatType: 2,
    source: 'deck-tracker',
  };
}

describe('computePlayOrderSplit', () => {
  it('empty input returns three all-zero buckets with winrate null', () => {
    const s = computePlayOrderSplit([]);
    expect(s.first).toEqual({ wins: 0, losses: 0, winrate: null });
    expect(s.coin).toEqual({ wins: 0, losses: 0, winrate: null });
    expect(s.unknown).toEqual({ wins: 0, losses: 0, winrate: null });
  });

  it('three matches split correctly', () => {
    const s = computePlayOrderSplit([
      rec('first', 'win'),
      rec('coin', 'loss'),
      rec('unknown', 'win'),
    ]);
    expect(s.first.wins).toBe(1);
    expect(s.first.winrate).toBe(100);
    expect(s.coin.losses).toBe(1);
    expect(s.coin.winrate).toBe(0);
    expect(s.unknown.wins).toBe(1);
    expect(s.unknown.winrate).toBe(100);
  });

  it("unknown-result matches don't count in wins/losses", () => {
    const s = computePlayOrderSplit([
      rec('first', 'win'),
      rec('first', 'unknown'),
    ]);
    expect(s.first.wins).toBe(1);
    expect(s.first.losses).toBe(0);
    expect(s.first.winrate).toBe(100);
  });

  it('aggregates many matches', () => {
    const matches = [
      ...Array.from({ length: 7 }, (_, i) => rec('first', 'win', `f-w-${i}`)),
      ...Array.from({ length: 3 }, (_, i) => rec('first', 'loss', `f-l-${i}`)),
      ...Array.from({ length: 2 }, (_, i) => rec('coin', 'win', `c-w-${i}`)),
      ...Array.from({ length: 4 }, (_, i) => rec('coin', 'loss', `c-l-${i}`)),
    ];
    const s = computePlayOrderSplit(matches);
    expect(s.first).toEqual({ wins: 7, losses: 3, winrate: 70 });
    expect(s.coin).toEqual({ wins: 2, losses: 4, winrate: 33.3 });
  });
});
