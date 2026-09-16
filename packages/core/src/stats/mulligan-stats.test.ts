import { expect, it } from 'vitest';
import { computeMulliganStats } from './mulligan-stats';
import { createEmptyMatchRecording } from '../recordings/match-recording';
import type { MatchHistoryRecord } from './match-history';

it('uses entity retention, filters matchup and excludes incomplete observations', () => {
  const recording = createEmptyMatchRecording({ recordingId: 'a', startedAt: 1, matchFingerprint: 'match' });
  recording.status = 'completed';
  recording.initialState.mulliganCapture = { startingComplete: true, postComplete: true };
  recording.initialState.startingHand = [{ entityId: 1, cardId: 'A', controllerId: 1 }, { entityId: 2, cardId: 'A', controllerId: 1 }];
  recording.initialState.postMulliganHand = [{ entityId: 1, cardId: 'A', controllerId: 1 }, { entityId: 3, cardId: 'B', controllerId: 1 }];
  recording.timeline = [{ kind: 'starting-hand', sourceEventIndex: 1 }, { kind: 'post-mulligan-hand', sourceEventIndex: 2 }];
  const match = { fingerprint: 'match', savedDeckId: 'deck', opponentClass: 'MAGE', playOrder: 'first', result: 'win' } as MatchHistoryRecord;
  const missing = { ...recording, recordingId: 'missing', initialState: { ...recording.initialState, postMulliganHand: [] } };
  const stats = computeMulliganStats([recording, missing], [match], { savedDeckId: 'deck', opponentClass: 'MAGE', playOrder: 'first' });
  expect(stats.sampleSize).toBe(1);
  expect(stats.excludedMissingData).toBe(1);
  expect(stats.rows[0]).toMatchObject({ cardId: 'A', offered: 2, kept: { copies: 1, wins: 1 }, replaced: { copies: 1, wins: 1 } });
  expect(computeMulliganStats([recording], [match], { playOrder: 'coin' }).sampleSize).toBe(0);
});
