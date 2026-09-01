import { describe, expect, it, vi } from 'vitest';
import { ExtraDisplayLogDetector } from './extra-display-log-detector';

const empty = { raw: '', content: '' } as const;

describe('ExtraDisplayLogDetector', () => {
  it('emits Follow attach from FULL_ENTITY ATTACHED tags and detaches on zone leave', () => {
    const emit = vi.fn();
    const det = new ExtraDisplayLogDetector({ emit });

    det.handle({
      type: 'full-entity',
      entityId: 80,
      cardId: 'PIRATE_CARD',
      tags: { ZONE: 'HAND', CONTROLLER: 1 },
      ...empty,
    });
    det.handle({
      type: 'full-entity',
      entityId: 500,
      cardId: 'CAP_101e',
      tags: { ZONE: 'PLAY', CONTROLLER: 1, ATTACHED: 80 },
      ...empty,
    });
    expect(emit).toHaveBeenCalledWith({
      type: 'follow-attach',
      enchantmentEntityId: 500,
      enchantmentCardId: 'CAP_101e',
      targetEntityId: 80,
      targetCardId: 'PIRATE_CARD',
    });

    det.handle({
      type: 'tag-change',
      entity: 500,
      tag: 'ZONE',
      value: 'GRAVEYARD',
      ...empty,
    });
    expect(emit).toHaveBeenCalledWith({ type: 'follow-detach', enchantmentEntityId: 500 });
  });

  it('emits attacks from ATTACK blocks, reading card id from the entity ref', () => {
    const emit = vi.fn();
    const det = new ExtraDisplayLogDetector({ emit });

    det.handle({
      type: 'block-start',
      blockType: 'ATTACK',
      entity: '[entityName=Stealth id=64 zone=PLAY cardId=STEALTH_MINION player=1]',
      effectCardId: '',
      target: null,
      subOption: null,
      ...empty,
    });

    expect(emit).toHaveBeenCalledWith({
      type: 'attack',
      attackerEntityId: 64,
      attackerCardId: 'STEALTH_MINION',
      attackerControllerId: 1,
    });
  });

  it('emits friendly discards from HAND to GRAVEYARD outside a PLAY block', () => {
    const emit = vi.fn();
    const det = new ExtraDisplayLogDetector({ emit });

    det.handle({
      type: 'full-entity',
      entityId: 40,
      cardId: 'HAND_SPELL',
      tags: { ZONE: 'HAND', CONTROLLER: 1 },
      ...empty,
    });
    det.handle({
      type: 'tag-change',
      entity: 40,
      tag: 'ZONE',
      value: 'GRAVEYARD',
      ...empty,
    });

    expect(emit).toHaveBeenCalledWith({
      type: 'discard',
      entityId: 40,
      cardId: 'HAND_SPELL',
      controllerId: 1,
    });
  });

  it('does not treat a played spell leaving hand as a discard', () => {
    const emit = vi.fn();
    const det = new ExtraDisplayLogDetector({ emit });

    det.handle({
      type: 'full-entity',
      entityId: 41,
      cardId: 'HAND_SPELL',
      tags: { ZONE: 'HAND', CONTROLLER: 1 },
      ...empty,
    });
    det.handle({
      type: 'block-start',
      blockType: 'PLAY',
      entity: 41,
      effectCardId: '',
      target: null,
      subOption: null,
      ...empty,
    });
    det.handle({
      type: 'block-start',
      blockType: 'ATTACK',
      entity: '[entityName=Minion id=9 zone=PLAY cardId=STEALTH_MINION player=1]',
      effectCardId: '',
      target: null,
      subOption: null,
      ...empty,
    });
    det.handle({ type: 'block-end', ...empty });
    det.handle({
      type: 'tag-change',
      entity: 41,
      tag: 'ZONE',
      value: 'GRAVEYARD',
      ...empty,
    });

    expect(emit.mock.calls.map((call) => call[0].type)).toEqual(['attack']);
  });

  it('resets tracked entities between games', () => {
    const emit = vi.fn();
    const det = new ExtraDisplayLogDetector({ emit });
    det.handle({
      type: 'full-entity',
      entityId: 40,
      cardId: 'HAND_SPELL',
      tags: { ZONE: 'HAND', CONTROLLER: 1 },
      ...empty,
    });
    det.reset();
    det.handle({
      type: 'tag-change',
      entity: 40,
      tag: 'ZONE',
      value: 'GRAVEYARD',
      ...empty,
    });
    expect(emit).not.toHaveBeenCalled();
  });
});
