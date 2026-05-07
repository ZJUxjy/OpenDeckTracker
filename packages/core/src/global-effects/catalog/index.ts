import type { EffectDef } from '../types';
import brashBattlemaster from './brash-battlemaster';
import cleansingCleric from './cleansing-cleric';
import emboldeningBlade from './emboldening-blade';
import pursuitOfJustice from './pursuit-of-justice';
import resilientSavior from './resilient-savior';
import roamFree from './roam-free';
import talyaEarthstrider from './talya-earthstrider';
import tamePet from './tame-pet';

// `tamePet` and `roamFree` carry typed params; the catalog erases
// per-effect param types and stores the structural-erased form.
// `Record<string, unknown>` isn't assignable to typed param shapes
// directly (no string index signature), so we route through `unknown`.
const ALL_EFFECTS: readonly EffectDef[] = [
  brashBattlemaster,
  cleansingCleric,
  emboldeningBlade,
  pursuitOfJustice,
  resilientSavior,
  roamFree as unknown as EffectDef,
  talyaEarthstrider,
  tamePet as unknown as EffectDef,
];

/**
 * Aggregated, alphabetically-sorted catalog of all known global
 * effects. Renderer / registry consumers MUST treat this as immutable.
 */
export const EFFECT_CATALOG: readonly EffectDef[] = [...ALL_EFFECTS].sort(
  (a, b) => a.id.localeCompare(b.id),
);
