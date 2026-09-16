import { describe, expect, it } from 'vitest';
import { createEmptyMatchRecording, type MatchRecordingDetail } from './match-recording';
import { indexReplayKeyEvents, reconstructReplayFrame } from './key-turns';

function fixture(): MatchRecordingDetail {
  const recording: MatchRecordingDetail = { ...createEmptyMatchRecording({ recordingId: 'replay', startedAt: 1 }), rawEvents: [
    { type: 'create-game' },
    { type: 'full-entity', entityId: 10, cardId: 'OWN', tags: { CONTROLLER: 1, ZONE: 'HAND' } },
    { type: 'full-entity', entityId: 20, cardId: 'HIDDEN', tags: { CONTROLLER: 2, ZONE: 'HAND', ZONE_POSITION: 1 } },
    { type: 'show-entity', entity: 20, cardId: 'PUBLIC', tags: { ZONE: 'PLAY', ATK: 4, HEALTH: 5, DAMAGE: 2 } },
    { type: 'tag-change', entity: 20, tag: 'ZONE', value: 'HAND' },
    { type: 'tag-change', entity: 20, tag: 'ZONE', value: 'DECK' },
    { type: 'tag-change', entity: 20, tag: 'ZONE', value: 'HAND' },
  ] };
  recording.initialState.startingHand = [{ entityId: 10, controllerId: 1, cardId: 'OWN' }];
  recording.entities = [{ entityId: 20, controllerId: 2, zone: 'HAND', hidden: false, cardId: 'FUTURE' }];
  return recording;
}

describe('public replay reconstruction', () => {
  it('never leaks hidden imported ids or final identities into earlier frames', () => {
    const frame = reconstructReplayFrame(fixture(), 2);
    expect(frame.friendlyHand[0]?.cardId).toBe('OWN');
    expect(frame.opponentHand[0]?.cardId).toBeNull();
    expect(JSON.stringify(frame)).not.toMatch(/HIDDEN|FUTURE|raw|tags/);
    expect(frame.incomplete).toBe(false);
  });
  it('reconstructs public stats and preserves a returned card only until shuffled', () => {
    expect(reconstructReplayFrame(fixture(), 3).board[0]).toMatchObject({ cardId: 'PUBLIC', attack: 4, health: 5, damage: 2 });
    expect(reconstructReplayFrame(fixture(), 4).opponentHand[0]?.cardId).toBe('PUBLIC');
    expect(reconstructReplayFrame(fixture(), 6).opponentHand[0]?.cardId).toBeNull();
  });
  it('flags missing and corrupt events without advancing their indexes', () => {
    const recording = fixture(); recording.rawEvents[3] = null;
    expect(reconstructReplayFrame(recording, 4)).toMatchObject({ incomplete: true, sourceEventIndex: 4 });
    expect(reconstructReplayFrame(recording, 4).opponentHand[0]?.cardId).toBeNull();
  });
  it('groups boundaries deterministically and retains turn numbers', () => {
    const recording = fixture(); recording.timeline = [
      { kind: 'game-completed', sourceEventIndex: 6 },
      { kind: 'turn-start', sourceEventIndex: 3, turnNumber: 2, controllerId: 1 },
      { kind: 'opponent-reveal', sourceEventIndex: 3, entityId: 20, controllerId: 2, cardId: 'PUBLIC' },
    ];
    expect(indexReplayKeyEvents(recording)).toEqual([
      { sourceEventIndex: 3, turn: 2, kinds: ['turn-start', 'opponent-reveal'] },
      { sourceEventIndex: 6, turn: 2, kinds: ['game-completed'] },
    ]);
  });
});
