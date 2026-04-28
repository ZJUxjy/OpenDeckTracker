import { describe, expect, it, vi } from 'vitest';
import type { DeckTrackerSnapshot, MatchRecording, MatchRecordingDetail } from '@hdt/core';
import type { PowerEvent } from '@hdt/hearthwatcher';
import { createMatchRecordingRecorder } from './match-recording-recorder';
import type { MatchRecordingStore } from './match-recording-store';

function snapshot(overrides: Partial<DeckTrackerSnapshot> = {}): DeckTrackerSnapshot {
  return {
    phase: 'IN_MATCH',
    matchInfo: {
      gameType: 4,
      formatType: 2,
      missionId: 0,
      localPlayer: { id: 1, name: 'Me' },
      opposingPlayer: { id: 2, name: 'Opponent' },
    },
    deck: {
      id: 42,
      name: 'Tempo Mage',
      original: [{ cardId: 'CS2_029', count: 2 }],
      remaining: [],
      extras: [],
    },
    pendingDeckSelection: null,
    friendlyHand: [],
    opposingHandCount: 0,
    opponent: { revealed: [], graveyard: [] },
    friendlyDeckCount: 0,
    error: null,
    updatedAt: 100,
    ...overrides,
  };
}

function createMemoryStore(): MatchRecordingStore & { recordings: Map<string, MatchRecording>; events: Map<string, unknown[]> } {
  const recordings = new Map<string, MatchRecording>();
  const events = new Map<string, unknown[]>();
  return {
    recordings,
    events,
    appendRawEvent(recordingId, event) {
      events.set(recordingId, [...(events.get(recordingId) ?? []), event]);
    },
    writeRecording(recording) {
      recordings.set(recording.recordingId, structuredClone(recording));
    },
    listCompleted() {
      return [];
    },
    loadRecording(recordingId): MatchRecordingDetail | null {
      const recording = recordings.get(recordingId);
      if (!recording) return null;
      return { ...recording, rawEvents: events.get(recordingId) ?? [] };
    },
  };
}

const createGame: PowerEvent = { type: 'create-game', raw: '', content: '' };
const completeState: PowerEvent = {
  type: 'tag-change',
  entity: 'GameEntity',
  tag: 'STATE',
  value: 'COMPLETE',
  raw: '',
  content: '',
};
const completeStep: PowerEvent = {
  type: 'tag-change',
  entity: 'GameEntity',
  tag: 'STEP',
  value: 'FINAL_GAMEOVER',
  raw: '',
  content: '',
};

describe('match-recording-recorder', () => {
  it('starts a recording on create-game and appends raw events', () => {
    const store = createMemoryStore();
    const recorder = createMatchRecordingRecorder({
      store,
      getSnapshot: () => snapshot(),
      now: () => 1_000,
      createRecordingId: () => 'rec-a',
    });

    recorder.handleEvent(createGame);
    recorder.handleEvent({
      type: 'tag-change',
      entity: 'GameEntity',
      tag: 'TURN',
      value: 1,
      raw: '',
      content: '',
    });

    expect(store.events.get('rec-a')).toHaveLength(2);
    expect(store.recordings.get('rec-a')).toMatchObject({
      recordingId: 'rec-a',
      status: 'in-progress',
      startedAt: 1_000,
    });
  });

  it('captures latest deck and match metadata', () => {
    const store = createMemoryStore();
    const recorder = createMatchRecordingRecorder({
      store,
      getSnapshot: () => snapshot(),
      now: () => 1_000,
      createRecordingId: () => 'rec-a',
    });

    recorder.handleEvent(createGame);

    expect(store.recordings.get('rec-a')).toMatchObject({
      metadata: {
        deckId: 42,
        deckName: 'Tempo Mage',
        opponentName: 'Opponent',
        gameType: 4,
        formatType: 2,
        missionId: 0,
      },
      initialState: {
        originalDeck: [{ cardId: 'CS2_029', count: 2 }],
      },
    });
  });

  it('captures starting and post-mulligan hands from local entities', () => {
    const store = createMemoryStore();
    const recorder = createMatchRecordingRecorder({
      store,
      getSnapshot: () => snapshot(),
      now: () => 1_000,
      createRecordingId: () => 'rec-a',
    });

    recorder.handleEvent(createGame);
    recorder.handleEvent({
      type: 'full-entity',
      entityId: 10,
      cardId: 'CS2_029',
      tags: { CONTROLLER: 1, ZONE: 'HAND' },
      raw: '',
      content: '',
    });
    recorder.handleEvent({
      type: 'tag-change',
      entity: 10,
      tag: 'MULLIGAN_STATE',
      value: 'INPUT',
      raw: '',
      content: '',
    });

    expect(store.recordings.get('rec-a')?.initialState.startingHand).toEqual([
      { entityId: 10, cardId: 'CS2_029', controllerId: 1 },
    ]);
    expect(store.recordings.get('rec-a')?.initialState.postMulliganHand).toEqual([
      { entityId: 10, cardId: 'CS2_029', controllerId: 1 },
    ]);
  });

  it.each([completeState, completeStep])('finalizes on game completion %#', (event) => {
    const store = createMemoryStore();
    const recorder = createMatchRecordingRecorder({
      store,
      getSnapshot: () => snapshot(),
      now: vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(2_000),
      createRecordingId: () => 'rec-a',
    });

    recorder.handleEvent(createGame);
    recorder.handleEvent(event);

    expect(store.recordings.get('rec-a')).toMatchObject({
      status: 'completed',
      endedAt: 2_000,
      finalSummary: {
        recordingId: 'rec-a',
        timelineEventCount: 2,
      },
    });
  });

  it('closes an existing recording as incomplete when a new game starts', () => {
    const store = createMemoryStore();
    const recorder = createMatchRecordingRecorder({
      store,
      getSnapshot: () => snapshot(),
      now: vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(2_000).mockReturnValueOnce(3_000),
      createRecordingId: vi.fn().mockReturnValueOnce('rec-a').mockReturnValueOnce('rec-b'),
    });

    recorder.handleEvent(createGame);
    recorder.handleEvent(createGame);

    expect(store.recordings.get('rec-a')).toMatchObject({
      status: 'incomplete',
      endedAt: 2_000,
    });
    expect(store.recordings.get('rec-b')).toMatchObject({
      status: 'in-progress',
      startedAt: 3_000,
    });
  });

  it('protects hidden opponent card IDs and records public reveals', () => {
    const store = createMemoryStore();
    const recorder = createMatchRecordingRecorder({
      store,
      getSnapshot: () => snapshot(),
      now: () => 1_000,
      createRecordingId: () => 'rec-a',
    });

    recorder.handleEvent(createGame);
    recorder.handleEvent({
      type: 'full-entity',
      entityId: 20,
      cardId: '',
      tags: { CONTROLLER: 2, ZONE: 'HAND' },
      raw: '',
      content: '',
    });
    expect(store.recordings.get('rec-a')?.entities).toContainEqual({
      entityId: 20,
      controllerId: 2,
      zone: 'HAND',
      hidden: true,
    });

    recorder.handleEvent({
      type: 'show-entity',
      entity: 20,
      cardId: 'CS2_032',
      tags: {},
      raw: '',
      content: '',
    });

    expect(store.recordings.get('rec-a')?.entities).toContainEqual({
      entityId: 20,
      controllerId: 2,
      zone: 'HAND',
      hidden: false,
      cardId: 'CS2_032',
    });
    expect(store.recordings.get('rec-a')?.timeline).toContainEqual({
      kind: 'opponent-reveal',
      entityId: 20,
      cardId: 'CS2_032',
      controllerId: 2,
      sourceEventIndex: 2,
    });
  });
});
