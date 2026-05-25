import type { EffectDef } from '../types';

/**
 * Infestor (Neutral, SET_1935 / The Great Dark Beyond).
 *
 * "Deathrattle: Your Zerg minions have +1 Attack for the rest of the
 * game."
 *
 * Fires on the deathrattle, not on play. Stackable per copy that dies.
 */
const infestor: EffectDef = {
  id: 'infestor',
  sourceCardId: 'SC_002',
  side: 'caster',
  mode: 'WILD',
};

export default infestor;
