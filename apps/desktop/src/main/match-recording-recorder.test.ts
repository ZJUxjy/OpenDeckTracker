import { describe, expect, it, vi } from 'vitest';
import type { DeckTrackerSnapshot, MatchRecording, MatchRecordingDetail } from '@hdt/core';
import type { PowerEvent } from '@hdt/hearthwatcher';
import { createMatchRecordingRecorder } from './match-recording-recorder';
import type { MatchRecordingStore } from './match-recording-store';

const player = (id: number, name: string, side: number) => ({
  id,
  name,
  side,
  standardRank: 0,
  standardLegendRank: 0,
  wildRank: 0,
  wildLegendRank: 0,
  classicRank: 0,
  classicLegendRank: 0,
  twistRank: 0,
  twistLegendRank: 0,
  cardbackId: 0,
});

function snapshot(overrides: Partial<DeckTrackerSnapshot> = {}): DeckTrackerSnapshot {
  return {
    phase: 'IN_MATCH',
    matchInfo: {
      gameType: 4,
      formatType: 2,
      missionId: 0,
      rankedSeasonId: 0,
      arenaSeasonId: 0,
      brawlSeasonId: 0,
      localPlayer: player(1, 'Me', 1),
      opposingPlayer: player(2, 'Opponent', 2),
    },
    deck: {
      id: 42,
      name: 'Tempo Mage',
      original: [{ cardId: 'CS2_029', count: 2 }],
      remaining: [],
      extraRemaining: [],
      extras: [],
    },
    pendingDeckSelection: null,
    friendlyHand: [],
    friendlyHandExtras: [],
    opposingHandCount: 0,
    opponent: { revealed: [], graveyard: [] },
    opponentClass: null,
    friendlyGraveyard: [],
    friendlyDeckCount: 0,
    friendlyEffects: [],
    opposingEffects: [],
    boardAttack: { friendly: 0, opposing: 0 },
    boardAttackToFace: { friendly: 0, opposing: 0 },
    friendlyHero: null,
    opposingHero: null,
    playerClass: null,
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

  it('stores live match fingerprint on recording summary', () => {
    const store = createMemoryStore();
    const recorder = createMatchRecordingRecorder({
      store,
      getSnapshot: () => snapshot(),
      getMatchFingerprint: () => 'match-v2-1000-1',
      now: vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(2_000),
      createRecordingId: () => 'rec-a',
    });

    recorder.handleEvent(createGame);
    recorder.handleEvent(completeState);

    expect(store.recordings.get('rec-a')).toMatchObject({
      status: 'completed',
      metadata: {
        matchFingerprint: 'match-v2-1000-1',
      },
      finalSummary: {
        matchFingerprint: 'match-v2-1000-1',
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

  it('persists analysis and narration frames for local card plays', () => {
    const store = createMemoryStore();
    const recorder = createMatchRecordingRecorder({
      store,
      getSnapshot: () => snapshot(),
      now: () => 1_000,
      createRecordingId: () => 'rec-a',
      resolveCardName: (cardId) => (cardId === 'MEND_300' ? '驯服宠物' : null),
    });

    recorder.handleEvent(createGame);
    recorder.handleEvent({
      type: 'full-entity',
      entityId: 30,
      cardId: 'MEND_300',
      tags: { CONTROLLER: 1, ZONE: 'HAND' },
      raw: '',
      content: '',
    });
    recorder.handleEvent({
      type: 'block-start',
      entity: 30,
      blockType: 'PLAY',
      target: null,
      raw: '',
      content: '',
    });

    const recording = store.recordings.get('rec-a');
    const analysisEvent = recording?.analysisEvents.find((event) => event.kind === 'card-played');
    const narrationFrame = recording?.narrationFrames.find((frame) => frame.eventKind === 'card-played');

    expect(analysisEvent).toMatchObject({
      kind: 'card-played',
      actor: 'local',
      cardId: 'MEND_300',
      entityId: 30,
      controllerId: 1,
      sourceEventIndex: 2,
    });
    expect(narrationFrame).toMatchObject({
      eventKind: 'card-played',
      sourceEventIndex: 2,
      text: '我方使用了驯服宠物。',
      facts: {
        cardId: 'MEND_300',
        actor: 'local',
      },
    });
  });

  it('keeps raw events and later narration when one narration derivation fails', () => {
    const store = createMemoryStore();
    const recorder = createMatchRecordingRecorder({
      store,
      getSnapshot: () => snapshot(),
      now: () => 1_000,
      createRecordingId: () => 'rec-a',
      resolveCardName: () => {
        throw new Error('resolver failed');
      },
    });

    recorder.handleEvent(createGame);
    recorder.handleEvent({
      type: 'full-entity',
      entityId: 40,
      cardId: 'MEND_300',
      tags: { CONTROLLER: 1, ZONE: 'HAND' },
      raw: '',
      content: '',
    });

    expect(() =>
      recorder.handleEvent({
        type: 'block-start',
        entity: 40,
        blockType: 'PLAY',
        raw: '',
        content: '',
      }),
    ).not.toThrow();

    recorder.handleEvent({
      type: 'tag-change',
      entity: 'GameEntity',
      tag: 'TURN',
      value: 2,
      raw: '',
      content: '',
    });

    const recording = store.recordings.get('rec-a');
    expect(store.events.get('rec-a')).toHaveLength(4);
    expect(recording?.rawEventRefs).toHaveLength(4);
    expect(recording?.timeline).toContainEqual({
      kind: 'play-card',
      entityId: 40,
      cardId: 'MEND_300',
      controllerId: 1,
      targetEntityId: null,
      sourceEventIndex: 2,
    });
    expect(recording?.narrationFrames).toContainEqual({
      sequence: 1,
      sourceEventIndex: 3,
      eventKind: 'turn-start',
      text: '第2回合开始。',
      facts: {
        actor: 'game',
        turnNumber: 2,
        controllerId: null,
      },
    });
  });
});
