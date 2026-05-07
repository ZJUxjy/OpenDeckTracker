import type { EffectDef } from '../types';

/**
 * Photon Cannon (Neutral, SET_1935 / The Great Dark Beyond).
 *
 * "Deal 3 damage. If this kills a minion, your Protoss minions cost
 * (1) less this game."
 *
 * Conditional trigger — only fires when the spell kills its target.
 * Detector still records it on cast; the renderer's body text spells
 * out the conditional so users understand timing.
 */
const photonCannon: EffectDef = {
  id: 'photon-cannon',
  sourceCardId: 'SC_753',
  side: 'caster',
  mode: 'STANDARD',
};

export default photonCannon;
