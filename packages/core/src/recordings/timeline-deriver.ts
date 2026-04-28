import type {
  MatchTimelineEvent,
  RecordedEntityState,
} from './match-recording';
import type { EntityInfo, Zone } from '../game/types';

export type RecordingEntityRef = number | string | null;

export interface RecordingEntityLike {
  entityId: number;
  cardId: string;
  zone: Zone;
  controllerId: number;
  info?: EntityInfo;
}

export interface RecordingEventLike {
  type: string;
  entity?: unknown;
  tag?: unknown;
  value?: unknown;
  cardId?: unknown;
  playerId?: unknown;
  blockType?: unknown;
  target?: unknown;
}

export function deriveTimelineEvents(args: {
  event: RecordingEventLike;
  previousEntities: Iterable<RecordingEntityLike>;
  currentEntities: Iterable<RecordingEntityLike>;
  localControllerId: number;
  sourceEventIndex: number;
}): MatchTimelineEvent[] {
  const previous = indexEntities(args.previousEntities);
  const current = indexEntities(args.currentEntities);
  const events: MatchTimelineEvent[] = [];

  const draw = deriveDraw(args.event, previous, current, args.localControllerId, args.sourceEventIndex);
  if (draw !== null) events.push(draw);

  const reveal = deriveOpponentReveal(
    args.event,
    previous,
    current,
    args.localControllerId,
    args.sourceEventIndex,
  );
  if (reveal !== null) events.push(reveal);

  const special = deriveEventOnly(args.event, current, args.localControllerId, args.sourceEventIndex);
  if (special !== null) events.push(special);

  return events;
}

export function sanitizeEntityForRecording(
  entity: RecordingEntityLike,
  localControllerId: number,
): RecordedEntityState {
  const hidden =
    entity.info?.hidden === true ||
    (entity.controllerId !== localControllerId &&
      (entity.zone === 'HAND' || entity.zone === 'DECK') &&
      entity.cardId === '');
  const state: RecordedEntityState = {
    entityId: entity.entityId,
    controllerId: entity.controllerId,
    zone: entity.zone,
    hidden,
  };
  if (!hidden && entity.cardId !== '') {
    state.cardId = entity.cardId;
  }
  return state;
}

function deriveDraw(
  event: RecordingEventLike,
  previous: Map<number, RecordingEntityLike>,
  current: Map<number, RecordingEntityLike>,
  localControllerId: number,
  sourceEventIndex: number,
): MatchTimelineEvent | null {
  if (event.type !== 'tag-change' || event.tag !== 'ZONE' || String(event.value) !== 'HAND') {
    return null;
  }
  const entityId = numericEntityRef(event.entity);
  if (entityId === null) return null;
  const before = previous.get(entityId);
  const after = current.get(entityId);
  if (!before || !after) return null;
  if (before.zone !== 'DECK' || after.zone !== 'HAND') return null;
  if (after.controllerId !== localControllerId || after.cardId === '') return null;
  return {
    kind: 'draw',
    entityId,
    cardId: after.cardId,
    controllerId: after.controllerId,
    sourceEventIndex,
  };
}

function deriveOpponentReveal(
  event: RecordingEventLike,
  previous: Map<number, RecordingEntityLike>,
  current: Map<number, RecordingEntityLike>,
  localControllerId: number,
  sourceEventIndex: number,
): MatchTimelineEvent | null {
  if (event.type !== 'show-entity' && event.type !== 'change-entity') return null;
  const entityId = numericEntityRef(event.entity);
  if (entityId === null) return null;
  const before = previous.get(entityId);
  const after = current.get(entityId);
  if (!after || after.controllerId === localControllerId || after.cardId === '') return null;
  if (before !== undefined && before.cardId !== '') return null;
  return {
    kind: 'opponent-reveal',
    entityId,
    cardId: after.cardId,
    controllerId: after.controllerId,
    sourceEventIndex,
  };
}

function deriveEventOnly(
  event: RecordingEventLike,
  current: Map<number, RecordingEntityLike>,
  localControllerId: number,
  sourceEventIndex: number,
): MatchTimelineEvent | null {
  if (event.type === 'shuffle-deck') {
    return {
      kind: 'shuffle-deck',
      playerId: typeof event.playerId === 'number' ? event.playerId : null,
      sourceEventIndex,
    };
  }
  if (event.type === 'tag-change') {
    if (event.tag === 'TURN') {
      const turnNumber = numericValue(event.value);
      return {
        kind: 'turn-start',
        turnNumber,
        controllerId: null,
        sourceEventIndex,
      };
    }
    if (event.tag === 'CURRENT_PLAYER') {
      const controllerId = numericEntityRef(event.entity) ?? numericValue(event.value);
      return {
        kind: 'turn-start',
        turnNumber: null,
        controllerId,
        sourceEventIndex,
      };
    }
  }
  if (
    event.type === 'block-start' &&
    typeof event.blockType === 'string' &&
    event.blockType.toUpperCase() === 'PLAY'
  ) {
    const entityId = numericEntityRef(event.entity);
    if (entityId === null) return null;
    const played = current.get(entityId);
    if (!played || played.controllerId !== localControllerId || played.cardId === '') return null;
    return {
      kind: 'play-card',
      entityId,
      cardId: played.cardId,
      controllerId: played.controllerId,
      targetEntityId: numericEntityRef(event.target),
      sourceEventIndex,
    };
  }
  return null;
}

function indexEntities(entities: Iterable<RecordingEntityLike>): Map<number, RecordingEntityLike> {
  const indexed = new Map<number, RecordingEntityLike>();
  for (const entity of entities) {
    indexed.set(entity.entityId, entity);
  }
  return indexed;
}

function numericEntityRef(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function numericValue(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}
