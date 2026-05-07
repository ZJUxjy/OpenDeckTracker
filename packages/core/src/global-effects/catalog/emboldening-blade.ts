import type { EffectDef } from '../types';

/**
 * Emboldening Blade (Paladin, SET_1980 / Cataclysm).
 *
 * "Battlecry: Give your Silver Hand Recruits +1/+1 this game."
 *
 * Stat buff to all current AND future Silver Hand Recruits.
 */
const emboldeningBlade: EffectDef = {
  id: 'emboldening-blade',
  sourceCardId: 'MEND_803',
  side: 'caster',
  mode: 'STANDARD',
};

export default emboldeningBlade;
