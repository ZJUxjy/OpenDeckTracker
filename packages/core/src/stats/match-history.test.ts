import { describe, expect, it } from 'vitest';
import {
  buildMatchFingerprint,
  isConstructedMatch,
  normalizeCompletedMatch,
  type CompletedMatchSummary,
} from './match-history';

const makeCompletedMatch = (
  overrides: Partial<CompletedMatchSummary> = {},
): CompletedMatchSummary => ({
  fingerprint: 'provided-fingerprint',
  startedAt: 1_000,
  endedAt: 2_000,
  result: 'unknown',
  playOrder: 'unknown',
  deckId: 42,
  deckName: 'Recorded Deck',
  opponentName: 'Opponent',
  opponentClass: 'Mage',
  gameType: 3,
  formatType: 2,
  source: 'deck-tracker',
  ...overrides,
});

describe('match history domain', () => {
  it('classifies ranked and casual constructed formats only', () => {
    expect(isConstructedMatch({ gameType: 3, formatType: 2 })).toBe(true);
    expect(isConstructedMatch({ gameType: 4, formatType: 1 })).toBe(true);
    expect(isConstructedMatch({ gameType: 5, formatType: 2 })).toBe(false);
    expect(isConstructedMatch({ gameType: 3, formatType: 0 })).toBe(false);
    expect(isConstructedMatch({ gameType: 3, formatType: 2, missionId: 270 })).toBe(false);
  });

  it('builds the same fingerprint for the same completed match', () => {
    const match = makeCompletedMatch({ fingerprint: '', startedAt: 1_000, endedAt: 2_000 });

    expect(buildMatchFingerprint(match)).toBe(buildMatchFingerprint({ ...match }));
  });

  it('normalizes duration and fingerprint for a completed match', () => {
    const match = normalizeCompletedMatch(
      makeCompletedMatch({ fingerprint: '', startedAt: 2_000, endedAt: 1_000 }),
    );

    expect(match.durationSeconds).toBe(0);
    expect(match.fingerprint).toBe(buildMatchFingerprint(match));
  });

  it('changes fingerprint when match identity fields change', () => {
    const base = makeCompletedMatch({ fingerprint: '' });
    const fingerprint = buildMatchFingerprint(base);

    expect(buildMatchFingerprint({ ...base, deckId: 99 })).not.toBe(fingerprint);
    expect(buildMatchFingerprint({ ...base, opponentName: 'Other Opponent' })).not.toBe(fingerprint);
    expect(buildMatchFingerprint({ ...base, startedAt: base.startedAt + 1 })).not.toBe(fingerprint);
    expect(buildMatchFingerprint({ ...base, result: 'win' })).not.toBe(fingerprint);
  });
});
