import type { EffectDef } from '../types';

/**
 * Cleansing Cleric (Priest, SET_1980 / Cataclysm).
 *
 * Battlecry: "Your healing effects restore 2 more Health this game."
 * One-shot fire-and-forget effect — no parameters, no expiry; the
 * registry just records that the buff is live for the caster's side.
 */
const cleansingCleric: EffectDef = {
  id: 'cleansing-cleric',
  sourceCardId: 'CATA_216',
  side: 'caster',
  mode: 'STANDARD',
};

export default cleansingCleric;
