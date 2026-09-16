import type { DeckVersion } from '../deck/deck-types';
import type { MatchHistoryRecord } from './match-history';

export function compareDeckVersions(before: DeckVersion, after: DeckVersion, matches: readonly MatchHistoryRecord[]) {
  const summarize = (version: DeckVersion) => {
    const games = matches.filter(match => match.savedDeckId === version.deckId && match.savedDeckVersion === version.version);
    const wins = games.filter(match => match.result === 'win').length;
    const losses = games.filter(match => match.result === 'loss').length;
    const turns = games.flatMap(match => typeof match.turnCount === 'number' && Number.isFinite(match.turnCount) && match.turnCount >= 0 ? [match.turnCount] : []);
    const classes = new Map<string, number>();
    for (const match of games) classes.set(match.opponentClass ?? 'unknown', (classes.get(match.opponentClass ?? 'unknown') ?? 0) + 1);
    return { games: games.length, wins, losses, unknown: games.length - wins - losses,
      winRate: wins + losses ? wins / (wins + losses) : null,
      averageTurns: turns.length ? turns.reduce((sum, value) => sum + value, 0) / turns.length : null,
      turnSamples: turns.length, matchups: [...classes].sort(([a], [b]) => a.localeCompare(b)).map(([opponentClass, count]) => ({ opponentClass, count })) };
  };
  const counts = (version: DeckVersion) => {
    const map = new Map<string, number>();
    for (const card of version.cards) map.set(card.cardId, (map.get(card.cardId) ?? 0) + card.count);
    return map;
  };
  const beforeCards = counts(before);
  const afterCards = counts(after);
  const diff = (a: Map<string, number>, b: Map<string, number>) => [...a]
    .flatMap(([cardId, count]) => count > (b.get(cardId) ?? 0) ? [{ cardId, count: count - (b.get(cardId) ?? 0) }] : [])
    .sort((a, b) => a.cardId.localeCompare(b.cardId));
  return { before: summarize(before), after: summarize(after),
    removed: diff(beforeCards, afterCards), added: diff(afterCards, beforeCards),
    unattributedGames: matches.filter(match => match.savedDeckId === before.deckId && match.savedDeckVersion === undefined).length };
}
