import { describe, expect, it } from 'vitest';
import { createEmptyMatchRecording } from './match-recording';

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
});
