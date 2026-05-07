import type { EffectDef } from '../types';

/**
 * Mystic Runesaber (Mage, SET_1980 / Cataclysm).
 *
 * "Elusive. Battlecry: Increase the effects of your Leylines by 1
 * this game."
 *
 * Stacking enhancement to all future Leyline effect magnitudes.
 */
const mysticRunesaber: EffectDef = {
  id: 'mystic-runesaber',
  sourceCardId: 'MEND_506',
  side: 'caster',
  mode: 'STANDARD',
};

export default mysticRunesaber;
