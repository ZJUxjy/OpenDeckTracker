import type { EffectDef } from '../types';

/**
 * Lightshow (Mage, SET_1809 / Festival of Legends).
 *
 * "Shoot N beams at enemies that each deal 2 damage. Your future
 * Lightshows shoot one more beam."
 *
 * Stacking effect — each cast permanently increases the beam count of
 * subsequent Lightshows. The deck-tracker merges repeated triggers
 * (refreshing triggeredAt); the renderer's body explains the stacking.
 */
const lightshow: EffectDef = {
  id: 'lightshow',
  sourceCardId: 'ETC_528',
  side: 'caster',
  mode: 'STANDARD',
};

export default lightshow;
