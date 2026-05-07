import type { EffectDef } from '../types';

/**
 * Resilient Savior (Paladin, SET_1980 / Cataclysm).
 *
 * "Divine Shield. After this loses Divine Shield, give your Silver
 * Hand Recruits +1 Health this game."
 *
 * Triggers on losing Divine Shield, not on play. Detected on play as
 * a placeholder — the buff is shown as live once the minion has
 * resolved its trigger (a future iteration could refine this with a
 * tag-change watch on TAG=DIVINE_SHIELD value=0).
 */
const resilientSavior: EffectDef = {
  id: 'resilient-savior',
  sourceCardId: 'MEND_801',
  side: 'caster',
  mode: 'STANDARD',
};

export default resilientSavior;
