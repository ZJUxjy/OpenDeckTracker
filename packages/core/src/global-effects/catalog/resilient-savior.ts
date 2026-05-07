import type { EffectDef } from '../types';

/**
 * Resilient Savior (Paladin, SET_1980 / Cataclysm).
 *
 * "Divine Shield. After this loses Divine Shield, give your Silver
 * Hand Recruits +1 Health this game."
 *
 * Triggers on *losing Divine Shield*, not on play. Marked `pending`
 * so the renderer shows a "conditional" badge — the buff isn't live
 * until the shield breaks. A future iteration can watch the
 * TAG_CHANGE DIVINE_SHIELD=0 event and clear `pending`.
 */
const resilientSavior: EffectDef = {
  id: 'resilient-savior',
  sourceCardId: 'MEND_801',
  side: 'caster',
  mode: 'STANDARD',
  pending: true,
};

export default resilientSavior;
