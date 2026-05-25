import { app, ipcMain } from 'electron';
import { join } from 'node:path';
import {
  aggregateStats,
  computeDeckLadderWinrate,
  computeSavedDeckMatchups,
  filterMatchesByFormat,
  filterMatchesByMode,
  type FormatFilter,
  type MatchModeFilter,
  type NormalizedCompletedMatch,
  type SavedDeckMatchupStats,
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
    matchMode: match.matchMode,
    gameType: match.gameType,
    formatType: match.formatType,
    endedAt: new Date(match.endedAt).toISOString(),
  });
  store.record(match);
}

export type SummaryIpcOptions = Omit<StatsQueryOptions, 'filter' | 'now' | 'recentLimit'>;
export interface ListRecentIpcOptions {
  formatFilter?: FormatFilter;
  matchModeFilter?: MatchModeFilter;
}
export interface SavedDeckMatchupsIpcOptions {
  formatFilter?: FormatFilter;
  matchModeFilter?: MatchModeFilter;
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
      const safeLimit = typeof limit === 'number' ? limit : 5;
      const all = store.listRecent({ filter, limit: 10_000 });
      const filtered =
        options?.formatFilter && options.formatFilter !== 'all'
          ? filterMatchesByFormat(all, options.formatFilter)
          : all;
      const modeFiltered =
        options?.matchModeFilter && options.matchModeFilter !== 'all'
          ? filterMatchesByMode(filtered, options.matchModeFilter)
          : filtered;
      return modeFiltered.slice(0, safeLimit);
    },
  );

  ipcMain.handle(
    'stats:get-saved-deck-matchups',
    (
      _event,
      savedDeckId: string,
      filter: StatsTimeFilter,
      options?: SavedDeckMatchupsIpcOptions,
    ): SavedDeckMatchupStats[] => {
      return computeSavedDeckMatchups(store.getAllForFilter({ filter }), savedDeckId, {
        filter,
        ...(options?.formatFilter !== undefined ? { formatFilter: options.formatFilter } : {}),
        ...(options?.matchModeFilter !== undefined
          ? { matchModeFilter: options.matchModeFilter }
          : {}),
      });
    },
  );

  ipcMain.handle(
    'stats:get-deck-ladder-winrate',
    (_event, query: { deckId?: number | null; deckName?: string | null }) => {
      return computeDeckLadderWinrate(store.getAllForFilter({ filter: 'all-time' }), query ?? {});
    },
  );
}

export function closeStatsHost(): void {
  defaultStore?.close();
  defaultStore = null;
}
