import type { MatchHistoryRecord } from './match-history';

/**
 * Hearthstone format filter. Maps to the numeric `formatType` column on
 * match history records:
 *   - `'standard'` → `formatType === 2`
 *   - `'wild'`     → `formatType === 1`
 *   - `'classic'`  → `formatType === 3`
 *   - `'twist'`    → `formatType === 4`
 *   - `'all'`      → identity (no filter)
 */
export type FormatFilter = 'standard' | 'wild' | 'classic' | 'twist' | 'all';

const FORMAT_TYPE_BY_FILTER: Record<Exclude<FormatFilter, 'all'>, number> = {
  standard: 2,
  wild: 1,
  classic: 3,
  twist: 4,
};

/**
 * Pure predicate that narrows a match list to the given format. `'all'` is
 * the identity (returns the input array reference unchanged).
 */
export function filterMatchesByFormat(
  matches: MatchHistoryRecord[],
  formatFilter: FormatFilter,
): MatchHistoryRecord[] {
  if (formatFilter === 'all') return matches;
  const target = FORMAT_TYPE_BY_FILTER[formatFilter];
  return matches.filter((m) => m.formatType === target);
}
