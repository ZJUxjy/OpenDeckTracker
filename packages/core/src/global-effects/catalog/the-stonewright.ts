import type { EffectDef } from '../types';

/**
 * The Stonewright (Shaman, SET_1810 / Core 2024).
 *
 * "Battlecry: For the rest of the game, your Totems have +2 Attack."
 *
 * Permanent +2 Attack buff to every current and future friendly Totem.
 */
const theStonewright: EffectDef = {
  id: 'the-stonewright',
  sourceCardId: 'CORE_REV_921',
  side: 'caster',
  mode: 'STANDARD',
};

export default theStonewright;
