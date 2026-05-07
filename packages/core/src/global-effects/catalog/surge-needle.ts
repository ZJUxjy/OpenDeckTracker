import type { EffectDef } from '../types';

/**
 * Surge Needle (Mage, SET_1980 / Cataclysm).
 *
 * "Battlecry: Your Leylines trigger an additional time this game."
 *
 * Stacking — each Surge Needle adds another Leyline trigger to every
 * future Leyline cast.
 */
const surgeNeedle: EffectDef = {
  id: 'surge-needle',
  sourceCardId: 'MEND_503',
  side: 'caster',
  mode: 'STANDARD',
};

export default surgeNeedle;
