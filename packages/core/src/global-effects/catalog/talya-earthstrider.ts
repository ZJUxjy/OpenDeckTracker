import type { EffectDef } from '../types';

/**
 * Talya Earthstrider (Hunter, SET_1980 / Cataclysm).
 *
 * "Battlecry: Your cards that summon Animal Companions summon 1 more
 * this game."
 *
 * Stacks per copy played. Modifies a future spawn count, not a stat,
 * so no params region — body text alone tells the story.
 */
const talyaEarthstrider: EffectDef = {
  id: 'talya-earthstrider',
  sourceCardId: 'MEND_304',
  side: 'caster',
  mode: 'STANDARD',
};

export default talyaEarthstrider;
