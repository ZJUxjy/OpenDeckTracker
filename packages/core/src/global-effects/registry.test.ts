import { describe, expect, it, vi } from 'vitest';
import { GlobalEffectsRegistry } from './registry';
import type { CardPlayedEvent, EffectDef, ExtractCtx } from './types';

void ((): ExtractCtx => ({ recentEvents: [], waitForMoreEvents: () => Promise.resolve([]) }));

const CLEANSING_CLERIC: EffectDef = {
  id: 'cleansing-cleric',
  sourceCardId: 'CATA_216',
  side: 'caster',
  mode: 'STANDARD',
};

const TAME_PET_DEFERRED: EffectDef<{ pool: string[] }> = {
  id: 'tame-pet',
  sourceCardId: 'MEND_300',
  side: 'caster',
  mode: 'STANDARD',
  parameterExtractor: vi.fn(),
};

function makeCatalog(...defs: EffectDef[]): Map<string, EffectDef> {
  return new Map(defs.map((d) => [d.sourceCardId, d]));
}

function play(
  cardId: string,
  controllerId: number,
  timestamp: number,
  entityId = timestamp,
): CardPlayedEvent {
  return { cardId, controllerId, timestamp, entityId };
}

describe('GlobalEffectsRegistry', () => {
  it('ignores unknown card plays', () => {
    const reg = new GlobalEffectsRegistry({
      catalogIndex: makeCatalog(CLEANSING_CLERIC),
      now: () => 1000,
      getControllerIds: () => ({ local: 1, opposing: 2 }),
    });
    reg.handleCardPlayed(play('EX1_001', 1, 1000));
    const snap = reg.snapshot();
    expect(snap.local).toEqual([]);
    expect(snap.opposing).toEqual([]);
  });

  it('attributes the effect to the caster side', () => {
    const reg = new GlobalEffectsRegistry({
      catalogIndex: makeCatalog(CLEANSING_CLERIC),
      now: () => 1234,
      getControllerIds: () => ({ local: 1, opposing: 2 }),
    });
    reg.handleCardPlayed(play('CATA_216', 1, 1234));
    const localOnly = reg.snapshot();
    expect(localOnly.local).toHaveLength(1);
    expect(localOnly.local[0]?.id).toBe('cleansing-cleric');
    expect(localOnly.local[0]?.triggerCount).toBe(1);
    expect(localOnly.opposing).toEqual([]);

    reg.handleCardPlayed(play('CATA_216', 2, 5678));
    const both = reg.snapshot();
    expect(both.local).toHaveLength(1);
    expect(both.opposing).toHaveLength(1);
    expect(both.opposing[0]?.id).toBe('cleansing-cleric');
  });

  it('reset clears both sides', () => {
    const reg = new GlobalEffectsRegistry({
      catalogIndex: makeCatalog(CLEANSING_CLERIC),
      now: () => 100,
      getControllerIds: () => ({ local: 1, opposing: 2 }),
    });
    reg.handleCardPlayed(play('CATA_216', 1, 100));
    reg.handleCardPlayed(play('CATA_216', 2, 100));
    expect(reg.snapshot().local).toHaveLength(1);
    expect(reg.snapshot().opposing).toHaveLength(1);
    reg.reset();
    expect(reg.snapshot()).toEqual({ local: [], opposing: [] });
  });

  it('re-triggering increments triggerCount, refreshes triggeredAt, stays unique', () => {
    let now = 100;
    const reg = new GlobalEffectsRegistry({
      catalogIndex: makeCatalog(CLEANSING_CLERIC),
      now: () => now,
      getControllerIds: () => ({ local: 1, opposing: 2 }),
    });
    reg.handleCardPlayed(play('CATA_216', 1, 100));
    let snap = reg.snapshot();
    expect(snap.local).toHaveLength(1);
    expect(snap.local[0]?.triggeredAt).toBe(100);
    expect(snap.local[0]?.triggerCount).toBe(1);

    now = 500;
    reg.handleCardPlayed(play('CATA_216', 1, 500));
    snap = reg.snapshot();
    expect(snap.local).toHaveLength(1);
    expect(snap.local[0]?.triggeredAt).toBe(500);
    expect(snap.local[0]?.triggerCount).toBe(2);

    now = 700;
    reg.handleCardPlayed(play('CATA_216', 1, 700));
    snap = reg.snapshot();
    expect(snap.local[0]?.triggerCount).toBe(3);
  });

  it('re-attributes controller-keyed effects when local/opposing ids become known late', () => {
    let ids = { local: 1, opposing: 2 };
    const reg = new GlobalEffectsRegistry({
      catalogIndex: makeCatalog(TAME_PET_DEFERRED as EffectDef),
      now: () => 1000,
      getControllerIds: () => ids,
    });

    // Startup replay can arrive before HearthMirror reports that the
    // local player is controller 2. Store by controller id so this
    // early trigger is not stranded on the old "opposing" side.
    reg.handleCardPlayed({
      cardId: 'MEND_300',
      controllerId: 2,
      entityId: 50,
      timestamp: 1000,
    });
    ids = { local: 2, opposing: 1 };
    reg.handleCardPlayed({
      cardId: 'MEND_300',
      controllerId: 2,
      entityId: 90,
      timestamp: 2000,
    });

    const snap = reg.snapshot();
    expect(snap.local).toHaveLength(1);
    expect(snap.local[0]?.id).toBe('tame-pet');
    expect(snap.local[0]?.triggerCount).toBe(2);
    expect(snap.opposing).toEqual([]);
  });

  it('snapshot is JSON-safe and stable on tie', () => {
    const reg = new GlobalEffectsRegistry({
      catalogIndex: makeCatalog(CLEANSING_CLERIC, TAME_PET_DEFERRED as EffectDef),
      now: () => 1000,
      getControllerIds: () => ({ local: 1, opposing: 2 }),
    });
    const events: CardPlayedEvent[] = [
      play('CATA_216', 1, 1000, 1),
      play('MEND_300', 1, 1000, 2),
    ];
    for (const e of events) reg.handleCardPlayed(e);

    const snap = reg.snapshot();
    const roundtripped = JSON.parse(JSON.stringify(snap)) as typeof snap;
    expect(roundtripped).toEqual(snap);

    const second = reg.snapshot();
    expect(second.local.map((e) => e.id)).toEqual(snap.local.map((e) => e.id));
  });

  it('runs declared extractor and patches params on resolve', async () => {
    const extractor = vi
      .fn<NonNullable<EffectDef<{ pool: string[] }>['parameterExtractor']>>()
      .mockResolvedValue({ pool: ['A', 'B', 'C'] });
    const def: EffectDef<{ pool: string[] }> = {
      id: 'with-params',
      sourceCardId: 'PARAM_001',
      side: 'caster',
      mode: 'STANDARD',
      parameterExtractor: extractor,
    };
    const reg = new GlobalEffectsRegistry({
      catalogIndex: makeCatalog(def as EffectDef),
      now: () => 1000,
      getControllerIds: () => ({ local: 1, opposing: 2 }),
      extractCtx: () => ({ recentEvents: [], waitForMoreEvents: () => Promise.resolve([]) }),
    });
    reg.handleCardPlayed(play('PARAM_001', 1, 1000));

    // Synchronously: params undefined.
    const before = reg.snapshot();
    expect(before.local[0]?.params).toBeUndefined();

    // After microtask: params populated.
    await new Promise((r) => setImmediate(r));
    const after = reg.snapshot();
    expect(after.local[0]?.params).toEqual({ pool: ['A', 'B', 'C'] });
  });

  it('snapshot orders entries by triggeredAt ascending', () => {
    let now = 100;
    const reg = new GlobalEffectsRegistry({
      catalogIndex: makeCatalog(CLEANSING_CLERIC, {
        ...CLEANSING_CLERIC,
        id: 'second',
        sourceCardId: 'OTHER_001',
      }),
      now: () => now,
      getControllerIds: () => ({ local: 1, opposing: 2 }),
    });
    now = 500;
    reg.handleCardPlayed(play('OTHER_001', 1, 500));
    now = 200;
    reg.handleCardPlayed(play('CATA_216', 1, 200));
    const snap = reg.snapshot();
    expect(snap.local.map((e) => e.triggeredAt)).toEqual([200, 500]);
  });
});
