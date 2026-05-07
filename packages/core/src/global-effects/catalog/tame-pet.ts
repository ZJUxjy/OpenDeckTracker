import type { EffectDef } from '../types';
import { readBeastSpawnsAfter } from '../power-log-extractor';

export interface TamePetParams {
  /** The 3 random beast cardIds chosen at cast time. */
  pool: string[];
}

/**
 * Tame Pet (Hunter, SET_1980 / Cataclysm).
 *
 * "Replace your future Animal Companions with random Beasts that cost
 * (1) more. Draw a card."
 *
 * The 3 chosen beasts are surfaced via Power.log spawn events
 * immediately after the cast. The extractor pulls the next 3 unique
 * cardIds from the post-cast event stream; if the log is truncated
 * (or arrives delayed past the wait window) it returns `null` and the
 * registry stores the effect with `params: undefined`.
 */
const tamePet: EffectDef<TamePetParams> = {
  id: 'tame-pet',
  sourceCardId: 'MEND_300',
  side: 'caster',
  mode: 'STANDARD',
  parameterExtractor: async (event, ctx) => {
    const pool = await readBeastSpawnsAfter(event, ctx, 3);
    return pool ? { pool } : null;
  },
};

export default tamePet;
