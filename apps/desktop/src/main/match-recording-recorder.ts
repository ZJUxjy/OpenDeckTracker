import { join } from 'node:path';
import {
  buildMatchRecordingSummary,
  createEmptyMatchRecording,
  deriveTimelineEvents,
  sanitizeEntityForRecording,
  type DeckTrackerSnapshot,
  type MatchRecording,
  type RecordedCardRef,
  type RecordingEntityLike,
} from '@hdt/core';
import {
  HearthWatcherGameState,
  reducePowerEvent,
  type PowerEvent,
} from '@hdt/hearthwatcher';
import type { MatchRecordingStore } from './match-recording-store';
import { createMatchRecordingStore } from './match-recording-store';

export interface MatchRecordingRecorder {
  handleEvent(event: PowerEvent): void;
}

export function createDefaultMatchRecordingStore(userDataPath: string): MatchRecordingStore {
  return createMatchRecordingStore(join(userDataPath, 'match-recordings'));
}

export function createMatchRecordingRecorder(args: {
  store: MatchRecordingStore;
  getSnapshot: () => DeckTrackerSnapshot | null;
  getMatchFingerprint?: () => string | null;
  now?: () => number;
  createRecordingId?: (startedAt: number) => string;
}): MatchRecordingRecorder {
  const now = args.now ?? Date.now;
  const createRecordingId = args.createRecordingId ?? defaultRecordingId;
  let current: MatchRecording | null = null;
  let state: HearthWatcherGameState | null = null;

  function persist(): void {
    if (current !== null) {
      args.store.writeRecording(current);
    }
  }

  function applyMatchFingerprint(recording: MatchRecording): void {
    const matchFingerprint = args.getMatchFingerprint?.() ?? null;
    if (matchFingerprint !== null) {
      recording.metadata.matchFingerprint = matchFingerprint;
    }
  }

  function startRecording(): void {
    if (current !== null && current.status === 'in-progress') {
      current.status = 'incomplete';
      current.endedAt = now();
      applyMatchFingerprint(current);
      current.finalSummary = buildMatchRecordingSummary(current);
      persist();
    }

    const startedAt = now();
    const snapshot = args.getSnapshot();
    const localControllerId = localControllerFromSnapshot(snapshot);
    const opponentControllerId = opponentControllerFromSnapshot(snapshot, localControllerId);
    state = new HearthWatcherGameState({
      localControllerId,
      opponentControllerId,
      originalDeck: snapshot?.deck?.original ?? [],
    });
    const matchFingerprint = args.getMatchFingerprint?.() ?? null;
    current = createEmptyMatchRecording({
      recordingId: createRecordingId(startedAt),
      startedAt,
      ...(matchFingerprint !== null ? { matchFingerprint } : {}),
    });
    applySnapshotMetadata(current, snapshot);
    applyMatchFingerprint(current);
    current.timeline.push({ kind: 'game-started', sourceEventIndex: 0 });
    persist();
  }

  return {
    handleEvent(event): void {
      if (event.type === 'create-game') {
        startRecording();
      }
      if (current === null || state === null) return;

      const sourceEventIndex = current.rawEventRefs.length;
      const previousEntities = toRecordingEntities(state);
      args.store.appendRawEvent(current.recordingId, event);
      current.rawEventRefs.push({ index: sourceEventIndex, type: event.type });

      reducePowerEvent(state, event);

      const snapshot = args.getSnapshot();
      applySnapshotMetadata(current, snapshot);
      applyMatchFingerprint(current);
      const localControllerId = state.localControllerId ?? localControllerFromSnapshot(snapshot);
      const currentEntities = toRecordingEntities(state);
      current.timeline.push(
        ...deriveTimelineEvents({
          event,
          previousEntities,
          currentEntities,
          localControllerId,
          sourceEventIndex,
        }),
      );
      current.entities = currentEntities.map((entity) =>
        sanitizeEntityForRecording(entity, localControllerId),
      );
      captureHands(current, currentEntities, localControllerId, event);

      if (isPowerGameComplete(event)) {
        current.status = 'completed';
        current.endedAt = now();
        applyMatchFingerprint(current);
        current.timeline.push({ kind: 'game-completed', sourceEventIndex });
        current.finalSummary = buildMatchRecordingSummary(current);
      }

      persist();
    },
  };
}

function applySnapshotMetadata(recording: MatchRecording, snapshot: DeckTrackerSnapshot | null): void {
  if (snapshot?.deck !== null && snapshot?.deck !== undefined) {
    recording.metadata.deckId = snapshot.deck.id;
    recording.metadata.deckName = snapshot.deck.name;
    recording.initialState.originalDeck = snapshot.deck.original.map((card) => ({ ...card }));
  }
  if (snapshot?.matchInfo !== null && snapshot?.matchInfo !== undefined) {
    recording.metadata.opponentName = snapshot.matchInfo.opposingPlayer?.name ?? null;
    recording.metadata.gameType = snapshot.matchInfo.gameType;
    recording.metadata.formatType = snapshot.matchInfo.formatType;
    recording.metadata.missionId = snapshot.matchInfo.missionId;
  }
}

function captureHands(
  recording: MatchRecording,
  entities: RecordingEntityLike[],
  localControllerId: number,
  event: PowerEvent,
): void {
  const hand = entities
    .filter((entity) => entity.controllerId === localControllerId && entity.zone === 'HAND' && entity.cardId !== '')
    .map((entity): RecordedCardRef => ({
      entityId: entity.entityId,
      cardId: entity.cardId,
      controllerId: entity.controllerId,
    }))
    .sort((a, b) => a.entityId - b.entityId);

  if (recording.initialState.startingHand.length === 0 && hand.length > 0) {
    recording.initialState.startingHand = hand;
    recording.timeline.push({ kind: 'starting-hand', sourceEventIndex: recording.rawEventRefs.length - 1 });
  }
  if (event.type === 'tag-change' && event.tag === 'MULLIGAN_STATE') {
    recording.initialState.postMulliganHand = hand;
    recording.timeline.push({
      kind: 'post-mulligan-hand',
      sourceEventIndex: recording.rawEventRefs.length - 1,
    });
  }
}

function toRecordingEntities(state: HearthWatcherGameState): RecordingEntityLike[] {
  return [...state.entities.values()].map((entity) => ({
    entityId: entity.entityId,
    cardId: entity.cardId,
    zone: entity.zone,
    controllerId: entity.controllerId,
    info: entity.info,
  }));
}

function isPowerGameComplete(event: PowerEvent): boolean {
  return (
    event.type === 'tag-change' &&
    event.entity === 'GameEntity' &&
    ((event.tag === 'STATE' && event.value === 'COMPLETE') ||
      (event.tag === 'STEP' && event.value === 'FINAL_GAMEOVER'))
  );
}

function localControllerFromSnapshot(snapshot: DeckTrackerSnapshot | null): number {
  const id = snapshot?.matchInfo?.localPlayer?.id;
  return id !== undefined && id > 0 ? id : 1;
}

function opponentControllerFromSnapshot(snapshot: DeckTrackerSnapshot | null, localControllerId: number): number {
  const id = snapshot?.matchInfo?.opposingPlayer?.id;
  if (id !== undefined && id > 0 && id !== localControllerId) return id;
  return localControllerId === 1 ? 2 : 1;
}

function defaultRecordingId(startedAt: number): string {
  const stamp = new Date(startedAt).toISOString().replace(/[:.]/g, '-');
  return `${stamp}_${Math.random().toString(16).slice(2, 8)}`;
}
