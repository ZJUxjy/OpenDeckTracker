import type { EffectDef } from '../types';

/**
 * Dew Process (Druid, SET_1810 / Core 2024).
 *
 * "For the rest of the game, players draw an extra card at the start
 * of their turn."
 *
 * Notable as the only catalog entry that affects BOTH players — the
 * UI still attributes it to the caster's side, but the description
 * makes the bilateral nature clear.
 */
const dewProcess: EffectDef = {
  id: 'dew-process',
  sourceCardId: 'CORE_MAW_024',
  side: 'caster',
  mode: 'STANDARD',
};

export default dewProcess;
