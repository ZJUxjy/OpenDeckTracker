import { describe, expect, it, vi } from 'vitest';
import type { PowerEvent } from '@hdt/hearthwatcher';
import { CardPlayedDetector } from './card-played-detector';

const empty = { raw: '', content: '' } as const;

function fullEntity(
  entityId: number,
  cardId: string,
  controllerId: number,
): PowerEvent {
  return {
    type: 'full-entity',
    entityId,
    cardId,
    tags: { CONTROLLER: controllerId, ZONE: 'HAND' },
    ...empty,
  };
}

function tagChange(
  entity: number,
  tag: string,
  value: string | number,
): PowerEvent {
  return { type: 'tag-change', entity, tag, value, ...empty };
}

describe('CardPlayedDetector', () => {
  it('emits a cardPlayed when an entity with known cardId moves to PLAY', () => {
    const emit = vi.fn();
    const det = new CardPlayedDetector({ emit, clock: () => 9000 });
    det.handle(fullEntity(64, 'CATA_216', 1));
    det.handle(tagChange(64, 'ZONE', 'PLAY'));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({
      cardId: 'CATA_216',
      controllerId: 1,
      timestamp: 9000,
    });
  });

  it('does not emit for unknown entities', () => {
    const emit = vi.fn();
    const det = new CardPlayedDetector({ emit });
    det.handle(tagChange(99, 'ZONE', 'PLAY'));
    expect(emit).not.toHaveBeenCalled();
  });

  it('does not emit when ZONE moves to non-PLAY', () => {
    const emit = vi.fn();
    const det = new CardPlayedDetector({ emit });
    det.handle(fullEntity(64, 'CATA_216', 1));
    det.handle(tagChange(64, 'ZONE', 'GRAVEYARD'));
    det.handle(tagChange(64, 'ZONE', 'HAND'));
    expect(emit).not.toHaveBeenCalled();
  });

  it('reset clears the entity table', () => {
    const emit = vi.fn();
    const det = new CardPlayedDetector({ emit });
    det.handle(fullEntity(64, 'CATA_216', 1));
    det.reset();
    det.handle(tagChange(64, 'ZONE', 'PLAY'));
    expect(emit).not.toHaveBeenCalled();
  });

  it('SHOW_ENTITY updates a known entity with a revealed cardId', () => {
    const emit = vi.fn();
    const det = new CardPlayedDetector({ emit });
    det.handle({
      type: 'full-entity',
      entityId: 64,
      cardId: '',
      tags: { CONTROLLER: 1 },
      ...empty,
    });
    det.handle({
      type: 'show-entity',
      entity: 64,
      cardId: 'CATA_216',
      tags: { CONTROLLER: 1 },
      ...empty,
    });
    det.handle(tagChange(64, 'ZONE', 'PLAY'));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]?.[0]).toMatchObject({ cardId: 'CATA_216' });
  });
});
