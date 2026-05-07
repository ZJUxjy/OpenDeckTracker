import type { EffectDef } from '../types';

/**
 * Photon Cannon (Neutral, SET_1935 / The Great Dark Beyond).
 *
 * "Deal 3 damage. If this kills a minion, your Protoss minions cost
 * (1) less this game."
 *
 * Conditional trigger — only fires when the spell kills its target.
 * Marked `pending` so the renderer shows a "conditional" badge; the
 * cost reduction may not actually be live if the damage went face or
 * was absorbed by Divine Shield.
 */
const photonCannon: EffectDef = {
  id: 'photon-cannon',
  sourceCardId: 'SC_753',
  side: 'caster',
  mode: 'STANDARD',
  pending: true,
};

export default photonCannon;
