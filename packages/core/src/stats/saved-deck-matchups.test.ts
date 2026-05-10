import { describe, expect, it } from 'vitest';
import { computeSavedDeckMatchups } from './saved-deck-matchups';
import type { MatchHistoryRecord } from './match-history';

const makeRecord = (overrides: Partial<MatchHistoryRecord>): MatchHistoryRecord => ({
  id: 1,
  fingerprint: 'fp',
  startedAt: Date.parse('2026-04-25T10:00:00Z'),
  endedAt: Date.parse('2026-04-25T10:10:00Z'),
  durationSeconds: 600,
  result: 'win',
  playOrder: 'first',
  deckId: null,
  deckName: null,
  opponentName: null,
  opponentClass: null,
  gameType: 3,
  formatType: 2,
  source: 'deck-tracker',
  ...overrides,
});

describe('computeSavedDeckMatchups', () => {
  it('filters records by saved deck id', () => {
    const records: MatchHistoryRecord[] = [
      makeRecord({
        id: 1,
        fingerprint: 'a',
        savedDeckId: 'deck-a',
        opponentClass: 'MAGE',
        result: 'win',
      }),
      makeRecord({
        id: 2,
        fingerprint: 'b',
        savedDeckId: 'deck-b',
        opponentClass: 'MAGE',
        result: 'loss',
      }),
    ];
    const result = computeSavedDeckMatchups(records, 'deck-a', { filter: 'all-time' });
    expect(result).toHaveLength(1);
    expect(result[0]?.opponentClass).toBe('MAGE');
    expect(result[0]?.wins).toBe(1);
    expect(result[0]?.losses).toBe(0);
  });

  it('computes winrate per opponent class', () => {
    const records: MatchHistoryRecord[] = [
      makeRecord({
        id: 1,
        fingerprint: 'a',
        savedDeckId: 'deck-a',
        opponentClass: 'MAGE',
        result: 'win',
      }),
      makeRecord({
        id: 2,
        fingerprint: 'b',
        savedDeckId: 'deck-a',
        opponentClass: 'MAGE',
        result: 'loss',
      }),
    ];
    const result = computeSavedDeckMatchups(records, 'deck-a', { filter: 'all-time' });
    expect(result[0]?.winrate).toBe(50);
  });

  it('ignores unknown results when computing winrate but counts them in matchesPlayed', () => {
    const records: MatchHistoryRecord[] = [
      makeRecord({
        id: 1,
        fingerprint: 'a',
        savedDeckId: 'deck-a',
        opponentClass: 'PRIEST',
        result: 'win',
      }),
      makeRecord({
        id: 2,
        fingerprint: 'b',
        savedDeckId: 'deck-a',
        opponentClass: 'PRIEST',
        result: 'unknown',
      }),
    ];
    const result = computeSavedDeckMatchups(records, 'deck-a', { filter: 'all-time' });
    expect(result[0]?.wins).toBe(1);
    expect(result[0]?.losses).toBe(0);
    expect(result[0]?.winrate).toBe(100);
    expect(result[0]?.matchesPlayed).toBe(2);
  });

  it('respects format filter', () => {
    const records: MatchHistoryRecord[] = [
      makeRecord({
        id: 1,
        fingerprint: 'a',
        savedDeckId: 'deck-a',
        opponentClass: 'MAGE',
        result: 'win',
        formatType: 2,
      }),
      makeRecord({
        id: 2,
        fingerprint: 'b',
        savedDeckId: 'deck-a',
        opponentClass: 'WARRIOR',
        result: 'loss',
        formatType: 1,
      }),
    ];
    const result = computeSavedDeckMatchups(records, 'deck-a', {
      filter: 'all-time',
      formatFilter: 'standard',
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.opponentClass).toBe('MAGE');
  });

  it('buckets null opponent class under Unknown', () => {
    const records: MatchHistoryRecord[] = [
      makeRecord({
        id: 1,
        fingerprint: 'a',
        savedDeckId: 'deck-a',
        opponentClass: null,
        result: 'win',
      }),
    ];
    const result = computeSavedDeckMatchups(records, 'deck-a', { filter: 'all-time' });
    expect(result[0]?.opponentClass).toBe('Unknown');
  });

  it('returns empty array when saved deck has no records', () => {
    const records: MatchHistoryRecord[] = [
      makeRecord({
        id: 1,
        fingerprint: 'a',
        savedDeckId: 'deck-other',
        opponentClass: 'MAGE',
        result: 'win',
      }),
    ];
    expect(computeSavedDeckMatchups(records, 'deck-a', { filter: 'all-time' })).toEqual([]);
  });

  it('sorts buckets by opponent class for stable rendering', () => {
    const records: MatchHistoryRecord[] = [
      makeRecord({ id: 1, fingerprint: 'a', savedDeckId: 'deck-a', opponentClass: 'MAGE' }),
      makeRecord({ id: 2, fingerprint: 'b', savedDeckId: 'deck-a', opponentClass: 'DRUID' }),
      makeRecord({ id: 3, fingerprint: 'c', savedDeckId: 'deck-a', opponentClass: 'ROGUE' }),
    ];
    const result = computeSavedDeckMatchups(records, 'deck-a', { filter: 'all-time' });
    expect(result.map((r) => r.opponentClass)).toEqual(['DRUID', 'MAGE', 'ROGUE']);
  });
});
