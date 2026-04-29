import { app, ipcMain } from 'electron';
import { join } from 'node:path';
import {
  aggregateStats,
  filterMatchesByFormat,
  type FormatFilter,
  type NormalizedCompletedMatch,
  type StatsQueryOptions,
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

export type SummaryIpcOptions = Omit<StatsQueryOptions, 'filter' | 'now' | 'recentLimit'>;
export interface ListRecentIpcOptions {
  formatFilter?: FormatFilter;
}

export function registerStatsIpc(store: MatchHistoryStore = getMatchHistoryStore()): void {
  ipcMain.handle(
    'stats:get-summary',
    (_event, filter: StatsTimeFilter, options?: SummaryIpcOptions): StatsSummary => {
      const merged: StatsQueryOptions = { filter, ...(options ?? {}) };
      return aggregateStats(store.getAllForFilter({ filter }), merged);
    },
  );

  ipcMain.handle(
    'stats:list-recent',
    (
      _event,
      filter: StatsTimeFilter,
      limit = 5,
      options?: ListRecentIpcOptions,
    ): MatchHistoryRecord[] => {
      const all = store.listRecent({ filter, limit: 10_000 });
      const filtered =
        options?.formatFilter && options.formatFilter !== 'all'
          ? filterMatchesByFormat(all, options.formatFilter)
          : all;
      return filtered.slice(0, limit);
    },
  );
}

export function closeStatsHost(): void {
  defaultStore?.close();
  defaultStore = null;
}
