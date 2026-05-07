import type { EffectDef } from '../types';
import cleansingCleric from './cleansing-cleric';
import tamePet from './tame-pet';

const ALL_EFFECTS: readonly EffectDef[] = [cleansingCleric, tamePet as EffectDef];

/**
 * Aggregated, alphabetically-sorted catalog of all known global
 * effects. Renderer / registry consumers MUST treat this as immutable.
 */
export const EFFECT_CATALOG: readonly EffectDef[] = [...ALL_EFFECTS].sort(
  (a, b) => a.id.localeCompare(b.id),
);
