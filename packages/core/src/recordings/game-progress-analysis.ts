import type {
  RecordingEntityLike,
  RecordingEventLike,
} from './timeline-deriver';

export type {
  RecordingEntityLike,
  RecordingEventLike,
} from './timeline-deriver';

export type GameProgressAnalysisActor = 'local' | 'opponent' | 'game' | 'unknown';

export type GameProgressAnalysisEventKind =
  | 'game-started'
  | 'starting-hand'
  | 'post-mulligan-hand'
  | 'turn-start'
  | 'card-drawn'
  | 'card-played'
  | 'opponent-card-revealed'
  | 'deck-shuffled'
  | 'game-completed';

export interface GameProgressAnalysisEvent {
  sequence: number;
  kind: GameProgressAnalysisEventKind;
  actor: GameProgressAnalysisActor;
  sourceEventIndex: number;
  entityId?: number;
  cardId?: string;
  controllerId?: number | null;
  targetEntityId?: number | null;
  turnNumber?: number | null;
  playerId?: number | null;
}

export function deriveGameProgressAnalysisEvents(args: {
  event: RecordingEventLike;
  previousEntities: Iterable<RecordingEntityLike>;
  currentEntities: Iterable<RecordingEntityLike>;
  localControllerId: number;
  sourceEventIndex: number;
  sequenceStart?: number;
}): GameProgressAnalysisEvent[] {
  const previous = indexEntities(args.previousEntities);
  const current = indexEntities(args.currentEntities);
  const events: Omit<GameProgressAnalysisEvent, 'sequence'>[] = [];

  const gameEvent = deriveGameEvent(args.event, args.sourceEventIndex);
  if (gameEvent !== null) events.push(gameEvent);

  const draw = deriveDraw(
    args.event,
    previous,
    current,
    args.localControllerId,
    args.sourceEventIndex,
  );
  if (draw !== null) events.push(draw);

  const reveal = deriveOpponentReveal(
    args.event,
    previous,
    current,
    args.localControllerId,
    args.sourceEventIndex,
  );
  if (reveal !== null) events.push(reveal);

  const play = deriveCardPlay(args.event, current, args.localControllerId, args.sourceEventIndex);
  if (play !== null) events.push(play);

  const sequenceStart = args.sequenceStart ?? 0;
  return events.map((event, index) => ({
    sequence: sequenceStart + index,
    ...event,
  }));
}

function deriveGameEvent(
  event: RecordingEventLike,
  sourceEventIndex: number,
): Omit<GameProgressAnalysisEvent, 'sequence'> | null {
  if (event.type === 'create-game') {
    return { kind: 'game-started', actor: 'game', sourceEventIndex };
  }
  if (event.type === 'shuffle-deck') {
    return {
      kind: 'deck-shuffled',
      actor: actorFromController(numericValue(event.playerId), null),
      sourceEventIndex,
      playerId: numericValue(event.playerId),
    };
  }
  if (event.type !== 'tag-change') return null;
  if (event.tag === 'TURN') {
    return {
      kind: 'turn-start',
      actor: 'game',
      sourceEventIndex,
      turnNumber: numericValue(event.value),
      controllerId: null,
    };
  }
  if (event.tag === 'CURRENT_PLAYER') {
    const controllerId = numericEntityRef(event.entity) ?? numericValue(event.value);
    return {
      kind: 'turn-start',
      actor: actorFromController(controllerId, null),
      sourceEventIndex,
      turnNumber: null,
      controllerId,
    };
  }
  if (
    event.entity === 'GameEntity' &&
    ((event.tag === 'STATE' && event.value === 'COMPLETE') ||
      (event.tag === 'STEP' && event.value === 'FINAL_GAMEOVER'))
  ) {
    return { kind: 'game-completed', actor: 'game', sourceEventIndex };
  }
  return null;
}

function deriveDraw(
  event: RecordingEventLike,
  previous: Map<number, RecordingEntityLike>,
  current: Map<number, RecordingEntityLike>,
  localControllerId: number,
  sourceEventIndex: number,
): Omit<GameProgressAnalysisEvent, 'sequence'> | null {
  if (event.type !== 'tag-change' || event.tag !== 'ZONE' || String(event.value) !== 'HAND') {
    return null;
  }
  const entityId = numericEntityRef(event.entity);
  if (entityId === null) return null;
  const before = previous.get(entityId);
  const after = current.get(entityId);
  if (!before || !after) return null;
  if (before.zone !== 'DECK' || after.zone !== 'HAND') return null;
  if (after.cardId === '') return null;
  return {
    kind: 'card-drawn',
    actor: actorFromController(after.controllerId, localControllerId),
    sourceEventIndex,
    entityId,
    cardId: after.cardId,
    controllerId: after.controllerId,
  };
}

function deriveOpponentReveal(
  event: RecordingEventLike,
  previous: Map<number, RecordingEntityLike>,
  current: Map<number, RecordingEntityLike>,
  localControllerId: number,
  sourceEventIndex: number,
): Omit<GameProgressAnalysisEvent, 'sequence'> | null {
  if (event.type !== 'show-entity' && event.type !== 'change-entity') return null;
  const entityId = numericEntityRef(event.entity);
  if (entityId === null) return null;
  const before = previous.get(entityId);
  const after = current.get(entityId);
  if (!after || after.controllerId === localControllerId || after.cardId === '') return null;
  if (before !== undefined && before.cardId !== '') return null;
  return {
    kind: 'opponent-card-revealed',
    actor: 'opponent',
    sourceEventIndex,
    entityId,
    cardId: after.cardId,
    controllerId: after.controllerId,
  };
}

function deriveCardPlay(
  event: RecordingEventLike,
  current: Map<number, RecordingEntityLike>,
  localControllerId: number,
  sourceEventIndex: number,
): Omit<GameProgressAnalysisEvent, 'sequence'> | null {
  if (
    event.type !== 'block-start' ||
    typeof event.blockType !== 'string' ||
    event.blockType.toUpperCase() !== 'PLAY'
  ) {
    return null;
  }
  const entityId = numericEntityRef(event.entity);
  if (entityId === null) return null;
  const played = current.get(entityId);
  if (!played || played.cardId === '') return null;
  const playedByController = played.info?.playedByController ?? played.controllerId;
  return {
    kind: 'card-played',
    actor: actorFromController(playedByController, localControllerId),
    sourceEventIndex,
    entityId,
    cardId: played.cardId,
    controllerId: playedByController,
    targetEntityId: numericEntityRef(event.target),
  };
}

function indexEntities(entities: Iterable<RecordingEntityLike>): Map<number, RecordingEntityLike> {
  const indexed = new Map<number, RecordingEntityLike>();
  for (const entity of entities) {
    indexed.set(entity.entityId, entity);
  }
  return indexed;
}

function actorFromController(
  controllerId: number | null,
  localControllerId: number | null,
): GameProgressAnalysisActor {
  if (controllerId === null) return 'game';
  if (localControllerId !== null && controllerId === localControllerId) return 'local';
  if (controllerId > 0) return 'opponent';
  return 'unknown';
}

function numericEntityRef(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function numericValue(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}
