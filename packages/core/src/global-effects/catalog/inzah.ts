import type { EffectDef } from '../types';

/**
 * Inzah (Shaman, SET_1809 / Festival of Legends).
 *
 * "Battlecry: For the rest of the game, your Overload cards cost (1)
 * less."
 *
 * Permanent (-1) cost reduction to all Overload cards in the caster's
 * hand and deck.
 */
const inzah: EffectDef = {
  id: 'inzah',
  sourceCardId: 'ETC_371',
  side: 'caster',
  mode: 'STANDARD',
};

export default inzah;
