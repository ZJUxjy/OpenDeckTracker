import type { AnimalCompanionPoolParams, EffectDef } from '../types';
import { readBeastSpawnsAfter } from '../power-log-extractor';

/**
 * Migrating Elekk (Hunter, SET_1980 / Cataclysm).
 *
 * "Taunt. Battlecry: Replace your future Animal Companions with
 * random Beasts that cost (1) more."
 *
 * Same Animal Companion pool replacement as Tame Pet (+1 cost), but
 * delivered as a Taunt minion rather than a 1-mana spell. Re-uses the
 * shared `readBeastSpawnsAfter` extractor.
 */
const migratingElekk: EffectDef<AnimalCompanionPoolParams> = {
  id: 'migrating-elekk',
  sourceCardId: 'MEND_303',
  side: 'caster',
  mode: 'STANDARD',
  parameterExtractor: async (event, ctx) => {
    const pool = await readBeastSpawnsAfter(event, ctx, 3);
    return pool ? { pool } : null;
  },
};

export default migratingElekk;
