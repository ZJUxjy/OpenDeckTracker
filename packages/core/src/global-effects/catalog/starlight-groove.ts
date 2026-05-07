import type { EffectDef } from '../types';

/**
 * Starlight Groove (Paladin, SET_1809 / Festival of Legends).
 *
 * "Give your hero Divine Shield. For the rest of the game, playing a
 * Holy spell refreshes it."
 *
 * Adds a recurring trigger to every future Holy spell cast — refreshes
 * the hero's Divine Shield. The Shield itself is one-shot, but the
 * "future Holy spells refresh it" rule is the persistent global effect.
 */
const starlightGroove: EffectDef = {
  id: 'starlight-groove',
  sourceCardId: 'ETC_330',
  side: 'caster',
  mode: 'STANDARD',
};

export default starlightGroove;
