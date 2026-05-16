import { describe, expect, it } from 'vitest';
import {
  deriveGameProgressAnalysisEvents,
  type RecordingEntityLike,
  type RecordingEventLike,
} from './game-progress-analysis';

const entity = (overrides: Partial<RecordingEntityLike> = {}): RecordingEntityLike => ({
  entityId: 1,
  cardId: 'CS2_029',
  zone: 'HAND',
  controllerId: 1,
  info: {},
  ...overrides,
});

const derive = (args: {
  event: RecordingEventLike;
  previous?: RecordingEntityLike[];
  current?: RecordingEntityLike[];
  index?: number;
  sequenceStart?: number;
}): ReturnType<typeof deriveGameProgressAnalysisEvents> =>
  deriveGameProgressAnalysisEvents({
    event: args.event,
    previousEntities: args.previous ?? [],
    currentEntities: args.current ?? [],
    localControllerId: 1,
    sourceEventIndex: args.index ?? 3,
    sequenceStart: args.sequenceStart ?? 0,
  });

describe('deriveGameProgressAnalysisEvents', () => {
  it('records local card plays with public card identity', () => {
    const events = derive({
      event: { type: 'block-start', blockType: 'PLAY', entity: 10, target: 20 },
      current: [entity({ entityId: 10, cardId: 'MEND_300', zone: 'PLAY' })],
    });

    expect(events).toEqual([
      {
        sequence: 0,
        kind: 'card-played',
        actor: 'local',
        sourceEventIndex: 3,
        entityId: 10,
        cardId: 'MEND_300',
        controllerId: 1,
        targetEntityId: 20,
      },
    ]);
  });

  it('records opponent public card plays when the card is revealed', () => {
    const events = derive({
      event: { type: 'block-start', blockType: 'PLAY', entity: 30 },
      current: [entity({ entityId: 30, cardId: 'CORE_EX1_339', zone: 'PLAY', controllerId: 2 })],
      index: 8,
      sequenceStart: 4,
    });

    expect(events).toEqual([
      {
        sequence: 4,
        kind: 'card-played',
        actor: 'opponent',
        sourceEventIndex: 8,
        entityId: 30,
        cardId: 'CORE_EX1_339',
        controllerId: 2,
        targetEntityId: null,
      },
    ]);
  });

  it('ignores unsupported events and keeps later sequence numbers contiguous', () => {
    const ignored = derive({
      event: { type: 'block-end' },
      sequenceStart: 7,
    });
    const later = derive({
      event: { type: 'block-start', blockType: 'PLAY', entity: 40 },
      current: [entity({ entityId: 40, cardId: 'CS2_032', zone: 'PLAY' })],
      index: 10,
      sequenceStart: 7 + ignored.length,
    });

    expect(ignored).toEqual([]);
    expect(later).toEqual([
      expect.objectContaining({
        sequence: 7,
        kind: 'card-played',
        cardId: 'CS2_032',
        sourceEventIndex: 10,
      }),
    ]);
  });
});
