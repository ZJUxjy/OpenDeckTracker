import type { EffectDef } from '../types';

/**
 * Interstellar Starslicer (Paladin, SET_1935 / The Great Dark Beyond).
 *
 * "Battlecry and Deathrattle: Reduce the Cost of your Librams by (1)
 * this game."
 *
 * Companion piece to Interstellar Wayfarer; same Libram-cost discount,
 * different art / stats. Stacks with all other Libram cost reducers.
 */
const interstellarStarslicer: EffectDef = {
  id: 'interstellar-starslicer',
  sourceCardId: 'GDB_726',
  side: 'caster',
  mode: 'STANDARD',
};

export default interstellarStarslicer;
