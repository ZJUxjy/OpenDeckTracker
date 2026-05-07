import type { EffectDef } from '../types';

/**
 * Bolide Behemoth (Shaman, SET_1935 / The Great Dark Beyond).
 *
 * "Battlecry: Your Asteroids deal 1 more damage this game.
 * Spellburst: Shuffle 3 of them into your deck."
 *
 * Stackable per copy played — every Bolide Behemoth's battlecry adds
 * another +1 to future Asteroid damage.
 */
const bolideBehemoth: EffectDef = {
  id: 'bolide-behemoth',
  sourceCardId: 'GDB_434',
  side: 'caster',
  mode: 'STANDARD',
};

export default bolideBehemoth;
