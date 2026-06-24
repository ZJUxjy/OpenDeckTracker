import { describe, expect, it, vi } from 'vitest';
import { HeraldTriggerDetector } from './herald-trigger-detector';

const empty = { raw: '', content: '' } as const;

describe('HeraldTriggerDetector', () => {
  it('emits entity ids for TRIGGER and POWER block starts', () => {
    const emit = vi.fn();
    const det = new HeraldTriggerDetector({ emit, clock: () => 1000 });

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

  it('suppresses duplicate same-entity same-block events within the replay window', () => {
    const emit = vi.fn();
    let now = 1000;
    const det = new HeraldTriggerDetector({ emit, clock: () => now });

    det.handle({ type: 'block-start', blockType: 'TRIGGER', entity: 10, effectCardId: '', target: null, subOption: null, ...empty });
    now += 1500;
    det.handle({ type: 'block-start', blockType: 'TRIGGER', entity: 10, effectCardId: '', target: null, subOption: null, ...empty });
    now += 5000;
    det.handle({ type: 'block-start', blockType: 'TRIGGER', entity: 10, effectCardId: '', target: null, subOption: null, ...empty });

    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('clears duplicate suppression on reset', () => {
    const emit = vi.fn();
    let now = 1000;
    const det = new HeraldTriggerDetector({ emit, clock: () => now });

    det.handle({ type: 'block-start', blockType: 'TRIGGER', entity: 10, effectCardId: '', target: null, subOption: null, ...empty });
    now += 1500;
    det.reset();
    det.handle({ type: 'block-start', blockType: 'TRIGGER', entity: 10, effectCardId: '', target: null, subOption: null, ...empty });

    expect(emit).toHaveBeenCalledTimes(2);
  });
});
