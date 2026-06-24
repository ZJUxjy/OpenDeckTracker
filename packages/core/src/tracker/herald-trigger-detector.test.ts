import { describe, expect, it, vi } from 'vitest';
import { HeraldTriggerDetector } from './herald-trigger-detector';

const empty = { raw: '', content: '' } as const;

describe('HeraldTriggerDetector', () => {
  it('emits entity ids for TRIGGER and POWER block starts', () => {
    const emit = vi.fn();
    const det = new HeraldTriggerDetector({ emit });

    det.handle({ type: 'block-start', blockType: 'TRIGGER', entity: 10, effectCardId: '', target: null, subOption: null, ...empty });
    det.handle({ type: 'block-start', blockType: 'POWER', entity: '[entityName=Shrine id=11 cardId=CATA_492 player=1]', effectCardId: '', target: null, subOption: null, ...empty });

    expect(emit).toHaveBeenCalledWith({ entityId: 10, blockType: 'TRIGGER' });
    expect(emit).toHaveBeenCalledWith({ entityId: 11, blockType: 'POWER' });
  });

  it('ignores PLAY blocks because CardPlayedDetector owns those', () => {
    const emit = vi.fn();
    const det = new HeraldTriggerDetector({ emit });

    det.handle({ type: 'block-start', blockType: 'PLAY', entity: 10, effectCardId: '', target: null, subOption: null, ...empty });

    expect(emit).not.toHaveBeenCalled();
  });

  it('emits repeated same-entity same-block events as separate trigger attempts', () => {
    const emit = vi.fn();
    const det = new HeraldTriggerDetector({ emit });

    det.handle({ type: 'block-start', blockType: 'TRIGGER', entity: 10, effectCardId: '', target: null, subOption: null, ...empty });
    det.handle({ type: 'block-start', blockType: 'TRIGGER', entity: 10, effectCardId: '', target: null, subOption: null, ...empty });
    det.handle({ type: 'block-start', blockType: 'TRIGGER', entity: 10, effectCardId: '', target: null, subOption: null, ...empty });

    expect(emit).toHaveBeenCalledTimes(3);
  });

  it('keeps reset safe for new-game wiring', () => {
    const emit = vi.fn();
    const det = new HeraldTriggerDetector({ emit });

    det.handle({ type: 'block-start', blockType: 'TRIGGER', entity: 10, effectCardId: '', target: null, subOption: null, ...empty });
    det.reset();
    det.handle({ type: 'block-start', blockType: 'TRIGGER', entity: 10, effectCardId: '', target: null, subOption: null, ...empty });

    expect(emit).toHaveBeenCalledTimes(2);
  });
});
