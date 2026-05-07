import { describe, it, expect } from 'vitest';
import type {
  ActiveEffect,
  CardPlayedEvent,
  EffectDef,
  ExpireRule,
  ExtractCtx,
  GlobalEffectsGameMode,
} from '@hdt/core';

describe('global-effects type exports', () => {
  it('the public type surface is reachable from @hdt/core', () => {
    // Force the import graph to be exercised at compile time. The
    // assertions below would not be expressible as types if the imports
    // weren't resolved.
    const noop = (): void => {};
    const dummy = {
      effectDef: null as EffectDef | null,
      activeEffect: null as ActiveEffect | null,
      cardPlayed: null as CardPlayedEvent | null,
      expire: null as ExpireRule | null,
      ctx: null as ExtractCtx | null,
      mode: null as GlobalEffectsGameMode | null,
    };
    noop();
    expect(dummy.effectDef).toBeNull();
    expect(dummy.activeEffect).toBeNull();
    expect(dummy.cardPlayed).toBeNull();
    expect(dummy.expire).toBeNull();
    expect(dummy.ctx).toBeNull();
    expect(dummy.mode).toBeNull();
  });
});
