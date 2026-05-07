import type { EffectDef } from '../types';

/**
 * Ley Walker (Mage, SET_1980 / Cataclysm).
 *
 * "Battlecry: Your Leylines cost (1) less this game. Deathrattle:
 * Get a random Leyline."
 *
 * Cost reduction for all Leyline cards (in hand and future draws).
 * Stackable per copy played.
 */
const leyWalker: EffectDef = {
  id: 'ley-walker',
  sourceCardId: 'MEND_501',
  side: 'caster',
  mode: 'STANDARD',
};

export default leyWalker;
