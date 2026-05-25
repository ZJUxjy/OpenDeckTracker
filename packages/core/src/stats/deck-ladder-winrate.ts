import { classifyMatchMode, type MatchHistoryRecord } from './match-history';

export interface DeckLadderWinrateQuery {
  deckId?: number | null;
  deckName?: string | null;
}

export interface DeckLadderWinrateStats {
  wins: number;
  losses: number;
  matchesPlayed: number;
  winrate: number | null;
}

export function computeDeckLadderWinrate(
  records: readonly MatchHistoryRecord[],
  query: DeckLadderWinrateQuery,
): DeckLadderWinrateStats {
  const hasDeckId = typeof query.deckId === 'number';
  const deckName = query.deckName?.trim() ?? '';
  const matches = records.filter((record) => {
    const mode = record.matchMode ?? classifyMatchMode(record);
    if (mode !== 'ranked') return false;
    if (hasDeckId) return record.deckId === query.deckId;
    return deckName !== '' && record.deckName === deckName;
  });

  const wins = matches.filter((record) => record.result === 'win').length;
  const losses = matches.filter((record) => record.result === 'loss').length;
  const known = wins + losses;
  return {
    wins,
    losses,
    matchesPlayed: matches.length,
    winrate: known === 0 ? null : Math.round((wins / known) * 1000) / 10,
  };
}
