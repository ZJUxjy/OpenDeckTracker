import type { EffectDef } from '../types';

/**
 * Groovy Cat (Druid, SET_1809 / Festival of Legends).
 *
 * "Battlecry and Deathrattle: Your Hero Power gives your hero 1 more
 * Attack this game."
 *
 * Companion to Free Spirit — stackable Hero Power Attack-buff
 * upgrade. Trigger on both battlecry and deathrattle.
 */
const groovyCat: EffectDef = {
  id: 'groovy-cat',
  sourceCardId: 'ETC_385',
  side: 'caster',
  mode: 'STANDARD',
};

export default groovyCat;
