import { app, ipcMain } from 'electron';
import { join } from 'node:path';
import {
  aggregateStats,
  type NormalizedCompletedMatch,
  type StatsSummary,
  type StatsTimeFilter,
  type MatchHistoryRecord,
} from '@hdt/core';
import {
  createMatchHistoryStore,
  type MatchHistoryStore,
} from './match-history-store';

let defaultStore: MatchHistoryStore | null = null;

export function createDefaultMatchHistoryStore(userDataPath: string): MatchHistoryStore {
  return createMatchHistoryStore(join(userDataPath, 'stats.sqlite'));
}

export function getMatchHistoryStore(): MatchHistoryStore {
  defaultStore ??= createDefaultMatchHistoryStore(app.getPath('userData'));
  return defaultStore;
}

export function recordCompletedMatch(
  match: NormalizedCompletedMatch,
  store: MatchHistoryStore = getMatchHistoryStore(),
): void {
  console.info('[stats] recording completed match', {
    fingerprint: match.fingerprint,
    deckId: match.deckId,
    deckName: match.deckName,
    opponentName: match.opponentName,
    result: match.result,
    gameType: match.gameType,
    formatType: match.formatType,
    endedAt: new Date(match.endedAt).toISOString(),
  });
  store.record(match);
}

export function registerStatsIpc(store: MatchHistoryStore = getMatchHistoryStore()): void {
  ipcMain.handle('stats:get-summary', (_event, filter: StatsTimeFilter): StatsSummary => {
    return aggregateStats(store.getAllForFilter({ filter }), { filter });
  });

  ipcMain.handle(
    'stats:list-recent',
    (_event, filter: StatsTimeFilter, limit = 5): MatchHistoryRecord[] => {
      return store.listRecent({ filter, limit });
    },
  );
}

export function closeStatsHost(): void {
  defaultStore?.close();
  defaultStore = null;
}
