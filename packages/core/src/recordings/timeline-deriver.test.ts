import { describe, expect, it } from 'vitest';
import {
  deriveTimelineEvents,
  sanitizeEntityForRecording,
  type RecordingEventLike,
  type RecordingEntityLike,
} from './timeline-deriver';

const entity = (overrides: Partial<RecordingEntityLike> = {}): RecordingEntityLike => ({
  entityId: 1,
  cardId: 'CS2_029',
  zone: 'DECK',
  controllerId: 1,
  info: {},
  ...overrides,
});

const derive = (args: {
  event: RecordingEventLike;
  previous?: RecordingEntityLike[];
  current?: RecordingEntityLike[];
  index?: number;
}): ReturnType<typeof deriveTimelineEvents> =>
  deriveTimelineEvents({
    event: args.event,
    previousEntities: args.previous ?? [],
    currentEntities: args.current ?? [],
    localControllerId: 1,
    sourceEventIndex: args.index ?? 3,
  });

describe('deriveTimelineEvents', () => {
  it('records a draw when a local card moves from deck to hand', () => {
    const events = derive({
      event: {
        type: 'tag-change',
        entity: 10,
        tag: 'ZONE',
        value: 'HAND',
      },
      previous: [entity({ entityId: 10, zone: 'DECK' })],
      current: [entity({ entityId: 10, zone: 'HAND' })],
      index: 4,
    });

    expect(events).toEqual([
      {
        kind: 'draw',
        entityId: 10,
        cardId: 'CS2_029',
        controllerId: 1,
        sourceEventIndex: 4,
      },
    ]);
  });

  it('records opponent reveals when a public card ID appears', () => {
    const events = derive({
      event: { type: 'show-entity', entity: 20, cardId: 'CS2_032' },
      previous: [entity({ entityId: 20, cardId: '', zone: 'HAND', controllerId: 2 })],
      current: [entity({ entityId: 20, cardId: 'CS2_032', zone: 'HAND', controllerId: 2 })],
    });

    expect(events).toEqual([
      {
        kind: 'opponent-reveal',
        entityId: 20,
        cardId: 'CS2_032',
        controllerId: 2,
        sourceEventIndex: 3,
      },
    ]);
  });

  it('records shuffle-deck events', () => {
    expect(derive({ event: { type: 'shuffle-deck', playerId: 1 } })).toEqual([
      { kind: 'shuffle-deck', playerId: 1, sourceEventIndex: 3 },
    ]);
  });

  it('records public turn boundaries', () => {
    expect(
      derive({ event: { type: 'tag-change', entity: 'GameEntity', tag: 'TURN', value: 2 } }),
    ).toEqual([{ kind: 'turn-start', turnNumber: 2, controllerId: null, sourceEventIndex: 3 }]);
  });

  it('records play-card events from play blocks', () => {
    const events = derive({
      event: { type: 'block-start', blockType: 'PLAY', entity: 30, target: 40 },
      current: [entity({ entityId: 30, cardId: 'CS2_029', zone: 'PLAY' })],
    });

    expect(events).toEqual([
      {
        kind: 'play-card',
        entityId: 30,
        cardId: 'CS2_029',
        controllerId: 1,
        targetEntityId: 40,
        sourceEventIndex: 3,
      },
    ]);
  });

  it('does not derive events from unsupported records', () => {
    expect(derive({ event: { type: 'block-end' } })).toEqual([]);
  });
});

describe('sanitizeEntityForRecording', () => {
  it('does not expose hidden opponent hand or deck card IDs', () => {
    expect(
      sanitizeEntityForRecording(entity({
        entityId: 50,
        cardId: 'SECRET_SHOULD_NOT_LEAK',
        zone: 'HAND',
        controllerId: 2,
        info: { hidden: true },
      }), 1),
    ).toEqual({
      entityId: 50,
      controllerId: 2,
      zone: 'HAND',
      hidden: true,
    });

    expect(
      sanitizeEntityForRecording(entity({
        entityId: 51,
        cardId: 'SECRET_SHOULD_NOT_LEAK',
        zone: 'DECK',
        controllerId: 2,
        info: { hidden: true },
      }), 1),
    ).toEqual({
      entityId: 51,
      controllerId: 2,
      zone: 'DECK',
      hidden: true,
    });
  });

  it('keeps revealed public card IDs', () => {
    expect(
      sanitizeEntityForRecording(entity({
        entityId: 52,
        cardId: 'CS2_032',
        zone: 'PLAY',
        controllerId: 2,
      }), 1),
    ).toEqual({
      entityId: 52,
      controllerId: 2,
      zone: 'PLAY',
      hidden: false,
      cardId: 'CS2_032',
    });
  });
});
