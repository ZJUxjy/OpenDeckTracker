import { describe, expect, it } from 'vitest';
import { buildMatchRecordingSummary, createEmptyMatchRecording } from './match-recording';

describe('createEmptyMatchRecording', () => {
  it('creates an in-progress recording with empty state', () => {
    const recording = createEmptyMatchRecording({
      recordingId: 'rec-1',
      startedAt: 1_772_000_000_000,
    });

    expect(recording).toMatchObject({
      recordingId: 'rec-1',
      status: 'in-progress',
      startedAt: 1_772_000_000_000,
      metadata: {
        deckId: null,
        deckName: null,
        opponentName: null,
        result: 'unknown',
      },
      initialState: {
        originalDeck: [],
        startingHand: [],
        postMulliganHand: [],
      },
      timeline: [],
      rawEventRefs: [],
    });
    expect(recording.endedAt).toBeNull();
  });

  it('stores match fingerprint metadata on recordings and summaries', () => {
    const recording = createEmptyMatchRecording({
      recordingId: 'rec-1',
      startedAt: 1_000,
      matchFingerprint: 'match-v2-1000-1',
    });

    expect(recording.metadata.matchFingerprint).toBe('match-v2-1000-1');
    expect(buildMatchRecordingSummary(recording).matchFingerprint).toBe('match-v2-1000-1');
  });
});
