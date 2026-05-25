import {
  classifyMatchMode,
  type MatchHistoryRecord,
  type MatchMode,
} from './match-history';

export type MatchModeFilter = MatchMode | 'all';

export function filterMatchesByMode(
  matches: MatchHistoryRecord[],
  matchModeFilter: MatchModeFilter,
): MatchHistoryRecord[] {
  if (matchModeFilter === 'all') return matches;
  return matches.filter((match) => {
    const mode = match.matchMode ?? classifyMatchMode(match);
    return mode === matchModeFilter;
  });
}
