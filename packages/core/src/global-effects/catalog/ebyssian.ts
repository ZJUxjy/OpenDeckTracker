import type { EffectDef } from '../types';

/**
 * Ebyssian (Hunter, SET_1980 / Cataclysm).
 *
 * "Battlecry: Your Dragons have Rush this game. (While in hand, play
 * a Dragon to become a 12/12 Dragon!)"
 *
 * Grants the Rush keyword to every current and future Dragon for the
 * rest of the match.
 */
const ebyssian: EffectDef = {
  id: 'ebyssian',
  sourceCardId: 'CATA_553',
  side: 'caster',
  mode: 'STANDARD',
};

export default ebyssian;
