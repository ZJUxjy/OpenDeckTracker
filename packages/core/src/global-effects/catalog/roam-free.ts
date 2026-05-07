import type { EffectDef } from '../types';
import { readBeastSpawnsAfter } from '../power-log-extractor';
import type { TamePetParams } from './tame-pet';

/**
 * Roam Free (Hunter, SET_1980 / Cataclysm).
 *
 * "Replace your future Animal Companions with random Beasts that cost
 * (2) more. Choose one to summon."
 *
 * Same shape as Tame Pet but the spawn pool offset is +2 mana instead
 * of +1; we reuse the 3-cardId pool params + Power.log extractor and
 * just discriminate by `id` in the renderer's body text.
 */
const roamFree: EffectDef<TamePetParams> = {
  id: 'roam-free',
  sourceCardId: 'MEND_307',
  side: 'caster',
  mode: 'STANDARD',
  parameterExtractor: async (event, ctx) => {
    const pool = await readBeastSpawnsAfter(event, ctx, 3);
    return pool ? { pool } : null;
  },
};

export default roamFree;
