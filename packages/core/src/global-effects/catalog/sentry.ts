import type { EffectDef } from '../types';

/**
 * Sentry (Priest, SET_1935 / The Great Dark Beyond).
 *
 * "Lifesteal. Deathrattle: Your Protoss minions cost (1) less this
 * game."
 *
 * Effect fires on the Deathrattle, not on play. Stacks with Photon
 * Cannon and Artanis.
 */
const sentry: EffectDef = {
  id: 'sentry',
  sourceCardId: 'SC_764',
  side: 'caster',
  mode: 'WILD',
};

export default sentry;
