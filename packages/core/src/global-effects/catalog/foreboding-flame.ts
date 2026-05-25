import type { EffectDef } from '../types';

/**
 * Foreboding Flame (Warlock, SET_1935 / The Great Dark Beyond).
 *
 * "Battlecry: Demons that didn't start in your deck cost (1) less
 * this game."
 *
 * Cost reduction targets *generated* Demons (discovered, summoned,
 * shuffled in) for the rest of the match.
 */
const forebodingFlame: EffectDef = {
  id: 'foreboding-flame',
  sourceCardId: 'GDB_121',
  side: 'caster',
  mode: 'WILD',
};

export default forebodingFlame;
