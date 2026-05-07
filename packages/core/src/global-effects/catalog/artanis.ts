import type { EffectDef } from '../types';

/**
 * Artanis (Neutral, SET_1935 / The Great Dark Beyond).
 *
 * "Battlecry: Summon two 3/4 Zealots with Charge. Your Protoss minions
 * cost (2) less this game."
 *
 * Stacks with Photon Cannon and Sentry's Protoss-cost reductions.
 */
const artanis: EffectDef = {
  id: 'artanis',
  sourceCardId: 'SC_754',
  side: 'caster',
  mode: 'STANDARD',
};

export default artanis;
