import type { EffectDef } from '../types';
import cleansingCleric from './cleansing-cleric';
import tamePet from './tame-pet';

// `tamePet` is `EffectDef<TamePetParams>`; the catalog erases the
// per-effect param type and stores the structural-erased form.
// `Record<string, unknown>` is not assignable to `TamePetParams`
// directly (no string index signature), so we route through `unknown`.
const ALL_EFFECTS: readonly EffectDef[] = [
  cleansingCleric,
  tamePet as unknown as EffectDef,
];

/**
 * Aggregated, alphabetically-sorted catalog of all known global
 * effects. Renderer / registry consumers MUST treat this as immutable.
 */
export const EFFECT_CATALOG: readonly EffectDef[] = [...ALL_EFFECTS].sort(
  (a, b) => a.id.localeCompare(b.id),
);
