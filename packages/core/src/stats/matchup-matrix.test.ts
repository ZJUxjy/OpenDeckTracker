import { describe, expect, it } from 'vitest';
import type { MatchHistoryRecord, MatchResult } from './match-history';
import { computeMatchupMatrix } from './matchup-matrix';

function rec(args: {
  playerClass?: string | null;
  opponentClass?: string | null;
  result: MatchResult;
  fingerprint?: string;
}): MatchHistoryRecord {
  const base: MatchHistoryRecord = {
    id: 0,
    fingerprint: args.fingerprint ?? `f-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: 0,
    endedAt: 0,
    durationSeconds: 0,
    result: args.result,
    playOrder: 'first',
    deckId: null,
    deckName: null,
    opponentName: null,
    opponentClass: args.opponentClass ?? null,
    gameType: 3,
    formatType: 2,
    source: 'deck-tracker',
  };
  if (args.playerClass !== undefined) {
    base.playerClass = args.playerClass;
  }
  return base;
}

describe('computeMatchupMatrix', () => {
  it('empty input returns empty matrix', () => {
    const m = computeMatchupMatrix([]);
    expect(m.cells).toEqual({});
    expect(m.playerClasses).toEqual([]);
    expect(m.opponentClasses).toEqual([]);
  });

  it('single match populates the right cell with 100% winrate', () => {
    const m = computeMatchupMatrix([
      rec({ playerClass: 'DRUID', opponentClass: 'MAGE', result: 'win' }),
    ]);
    expect(m.cells.DRUID?.MAGE).toEqual({ wins: 1, losses: 0, winrate: 100 });
    expect(m.playerClasses).toEqual(['DRUID']);
    expect(m.opponentClasses).toEqual(['MAGE']);
  });

  it('null playerClass buckets under Unknown row', () => {
    const m = computeMatchupMatrix([
      rec({ playerClass: null, opponentClass: 'MAGE', result: 'win' }),
    ]);
    expect(m.cells.Unknown?.MAGE).toEqual({ wins: 1, losses: 0, winrate: 100 });
    expect(m.playerClasses).toEqual(['Unknown']);
  });

  it('null opponentClass buckets under Unknown column', () => {
    const m = computeMatchupMatrix([
      rec({ playerClass: 'DRUID', opponentClass: null, result: 'loss' }),
    ]);
    expect(m.cells.DRUID?.Unknown).toEqual({ wins: 0, losses: 1, winrate: 0 });
    expect(m.opponentClasses).toEqual(['Unknown']);
  });

  it('aggregates wins and losses in the same cell', () => {
    const m = computeMatchupMatrix([
      rec({ playerClass: 'DRUID', opponentClass: 'MAGE', result: 'win' }),
      rec({ playerClass: 'DRUID', opponentClass: 'MAGE', result: 'win' }),
      rec({ playerClass: 'DRUID', opponentClass: 'MAGE', result: 'loss' }),
    ]);
    const cell = m.cells.DRUID?.MAGE;
    expect(cell?.wins).toBe(2);
    expect(cell?.losses).toBe(1);
    expect(cell?.winrate).toBe(66.7);
  });

  it("unknown-result matches don't change cell winrate when only unknowns present", () => {
    const m = computeMatchupMatrix([
      rec({ playerClass: 'DRUID', opponentClass: 'MAGE', result: 'unknown' }),
    ]);
    const cell = m.cells.DRUID?.MAGE;
    expect(cell?.wins).toBe(0);
    expect(cell?.losses).toBe(0);
    expect(cell?.winrate).toBe(null);
  });

  it("unknown-result matches don't affect cell winrate when mixed with knowns", () => {
    const m = computeMatchupMatrix([
      rec({ playerClass: 'DRUID', opponentClass: 'MAGE', result: 'win' }),
      rec({ playerClass: 'DRUID', opponentClass: 'MAGE', result: 'unknown' }),
    ]);
    const cell = m.cells.DRUID?.MAGE;
    expect(cell?.wins).toBe(1);
    expect(cell?.losses).toBe(0);
    expect(cell?.winrate).toBe(100);
  });

  it('player and opponent class lists are sorted', () => {
    const m = computeMatchupMatrix([
      rec({ playerClass: 'WARLOCK', opponentClass: 'MAGE', result: 'win' }),
      rec({ playerClass: 'DRUID', opponentClass: 'PRIEST', result: 'win' }),
      rec({ playerClass: 'HUNTER', opponentClass: 'DRUID', result: 'win' }),
    ]);
    expect(m.playerClasses).toEqual(['DRUID', 'HUNTER', 'WARLOCK']);
    expect(m.opponentClasses).toEqual(['DRUID', 'MAGE', 'PRIEST']);
  });
});
