import type { EffectDef } from '../types';

/**
 * Brash Battlemaster (Paladin, SET_1980 / Cataclysm).
 *
 * "Rush. Deathrattle: Give your Silver Hand Recruits +1 Attack this
 * game."
 *
 * The Deathrattle is what registers the global effect — the registry
 * receives a `card:played` event when the minion dies and the
 * Deathrattle fires (the existing detector tracks ZONE→PLAY for the
 * minion when summoned; the body of the Deathrattle becomes a follow-up
 * BLOCK_START with the minion as the source). M1 fires the registry
 * on the play, the rendered description makes the timing clear.
 */
const brashBattlemaster: EffectDef = {
  id: 'brash-battlemaster',
  sourceCardId: 'MEND_800',
  side: 'caster',
  mode: 'STANDARD',
};

export default brashBattlemaster;
