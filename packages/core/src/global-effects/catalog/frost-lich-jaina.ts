import type { EffectDef } from '../types';

/**
 * Frost Lich Jaina (Mage, SET_1810 / Core 2024).
 *
 * "Battlecry: Summon a 3/6 Water Elemental. Your Elementals have
 * Lifesteal this game."
 *
 * Grants a keyword (Lifesteal) to every current and future friendly
 * Elemental for the rest of the match.
 */
const frostLichJaina: EffectDef = {
  id: 'frost-lich-jaina',
  sourceCardId: 'CORE_ICC_833',
  side: 'caster',
  mode: 'STANDARD',
};

export default frostLichJaina;
