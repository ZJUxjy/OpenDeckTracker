import type { EffectDef } from '../types';

/**
 * Interstellar Wayfarer (Paladin, SET_1935 / The Great Dark Beyond).
 *
 * "Divine Shield. Battlecry and Deathrattle: Reduce the Cost of your
 * Librams by (1) this game."
 *
 * Stacks per trigger (battlecry, deathrattle, and per copy played).
 */
const interstellarWayfarer: EffectDef = {
  id: 'interstellar-wayfarer',
  sourceCardId: 'GDB_721',
  side: 'caster',
  mode: 'WILD',
};

export default interstellarWayfarer;
