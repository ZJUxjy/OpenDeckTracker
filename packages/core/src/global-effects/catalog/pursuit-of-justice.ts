import type { EffectDef } from '../types';

/**
 * Pursuit of Justice (Paladin, SET_1810 / Core 2024).
 *
 * "Give +1 Attack to Silver Hand Recruits you summon this game."
 *
 * Forward-looking stat buff that applies on every future Silver Hand
 * Recruit summon for the rest of the match.
 */
const pursuitOfJustice: EffectDef = {
  id: 'pursuit-of-justice',
  sourceCardId: 'CORE_CS3_029',
  side: 'caster',
  mode: 'STANDARD',
};

export default pursuitOfJustice;
