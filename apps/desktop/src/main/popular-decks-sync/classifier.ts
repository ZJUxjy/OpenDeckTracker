import type { PopularDeckArchetype } from '@hdt/core';

/**
 * Maps an HSGuru archetype label (free text like "Aggro Hunter",
 * "Big Priest") to one of the 6 buckets in `PopularDeckArchetype`.
 *
 * Priority order: Combo > Tempo > Ramp > Aggro > Control > Midrange.
 * Unknown labels fall back to `'Midrange'` so the deck-finder spec's
 * archetype invariant is never violated.
 */
export function classifyArchetypeLabel(label: string): PopularDeckArchetype {
  const lc = label.toLowerCase();
  if (lc.includes('combo')) return 'Combo';
  if (lc.includes('tempo')) return 'Tempo';
  if (lc.includes('ramp')) return 'Ramp';
  if (lc.includes('aggro')) return 'Aggro';
  if (lc.includes('control')) return 'Control';
  return 'Midrange';
}
