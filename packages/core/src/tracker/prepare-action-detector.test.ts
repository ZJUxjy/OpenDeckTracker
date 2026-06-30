import { describe, expect, it, vi } from 'vitest';
import { PrepareActionDetector } from './prepare-action-detector';

const empty = { raw: '', content: '' } as const;

function tagChange(entity: number | string, tag: string, value: string | number) {
  return { type: 'tag-change' as const, entity, tag, value, ...empty };
}

function showEntity(entityId: number, cardId: string, controllerId = 1) {
  return {
    type: 'show-entity' as const,
    entity: entityId,
    cardId,
    tags: { ZONE: 'HAND', CONTROLLER: controllerId, COST: 3 },
    ...empty,
  };
}

describe('PrepareActionDetector', () => {
  it('emits when an entity moves HAND → DECK, loses COST, then returns to HAND', () => {
    const emit = vi.fn();
    const det = new PrepareActionDetector({ emit });

    det.handle(showEntity(42, 'CATA_EVENT_401'));
    det.handle(tagChange(42, 'ZONE', 'DECK'));
    det.handle(tagChange(42, 'COST', 0));
    det.handle(tagChange(42, 'ZONE', 'HAND'));

    expect(emit).toHaveBeenCalledWith({
      entityId: 42,
      controllerId: 1,
      cardId: 'CATA_EVENT_401',
      baseCost: 3,
      effectiveCost: 0,
      discount: 3,
    });
  });

  it('accepts numeric zone enum values', () => {
    const emit = vi.fn();
    const det = new PrepareActionDetector({ emit });

    det.handle(showEntity(7, 'JAIL_407'));
    det.handle(tagChange(7, 'ZONE', 2));
    det.handle(tagChange(7, 'COST', 1));
    det.handle(tagChange(7, 'ZONE', 3));

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]![0].discount).toBe(2);
  });

  it('ignores sequences without a cost decrease', () => {
    const emit = vi.fn();
    const det = new PrepareActionDetector({ emit });

    det.handle(showEntity(9, 'CATA_EVENT_401'));
    det.handle(tagChange(9, 'ZONE', 'DECK'));
    det.handle(tagChange(9, 'ZONE', 'HAND'));

    expect(emit).not.toHaveBeenCalled();
  });

  it('suppresses duplicate emits for the same entity within the dedupe window', () => {
    const emit = vi.fn();
    let now = 1_000;
    const det = new PrepareActionDetector({ emit, clock: () => now });

    const run = () => {
      det.handle(showEntity(55, 'CATA_EVENT_401'));
      det.handle(tagChange(55, 'ZONE', 'HAND'));
      det.handle(tagChange(55, 'ZONE', 'DECK'));
      det.handle(tagChange(55, 'COST', 0));
      det.handle(tagChange(55, 'ZONE', 'HAND'));
    };

    run();
    now += 500;
    run();

    expect(emit).toHaveBeenCalledTimes(1);
  });
});
