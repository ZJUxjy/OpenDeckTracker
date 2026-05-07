import type { EffectDef } from '../types';

/**
 * Free Spirit (Druid, SET_1809 / Festival of Legends).
 *
 * "Battlecry and Deathrattle: Your Hero Power gains 1 more Armor this
 * game."
 *
 * Stackable Hero Power upgrade — both the battlecry and deathrattle
 * fire individually, and copies stack.
 */
const freeSpirit: EffectDef = {
  id: 'free-spirit',
  sourceCardId: 'ETC_382',
  side: 'caster',
  mode: 'STANDARD',
};

export default freeSpirit;
