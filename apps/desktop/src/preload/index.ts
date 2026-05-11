import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { CardDef, DeckBlueprint, SearchFilter } from '@hdt/hearthdb';
import type {
  OpponentDeckPrediction,
  PopularDeckEnriched,
  SetProgress,
} from '@hdt/core';

type PopularDecksListResult = {
  decks: PopularDeckEnriched[];
  source: 'synced' | 'seed';
  fetchedAt: string | null;
};

type PopularDecksSyncProgress = {
  phase: 'meta' | 'variants' | 'transform' | 'persist';
  completed: number;
  total: number;
  currentLabel?: string;
};

type PopularDecksSyncStartResult =
  | { ok: true; fetchedAt: string; count: number }
  | { ok: false; error: string };

type PopularDecksSyncStatus = { inFlight: boolean; lastFetchedAt: string | null };
import type {
  CreateDeckInput,
  DeckTrackerEvent,
  DeckTrackerSnapshot,
  DeckDetail,
  DeckSummary,
  FormatFilter,
  MatchRecordingDetail,
  MatchRecordingSummary,
  MatchHistoryRecord,
  SavedDeckMatchupStats,
  StatsQueryOptions,
  StatsSummary,
  StatsTimeFilter,
  UpdateDeckPatch,
} from '@hdt/core';
import type { LiveDeckSnapshotInput } from '../main/deck-store';
import type { LiveDeckSyncResult } from '../main/deck-sync-host';
import type { HearthWatcherDiagnostic, PowerEvent } from '@hdt/hearthwatcher';
import type {
  AccountId,
  ArenaInfo,
  BattleTag,
  BattlegroundRatingInfo,
  BoardState,
  Choices,
  CollectionCard,
  CollectionDiagnostic,
  Deck,
  DeckState,
  GameServerInfo,
  GameType,
  HandState,
  HearthstoneWindow,
  IsMulligan,
  MatchInfo,
  MedalInfo,
  OpponentSecrets,
  SelectedDeck,
} from '@hdt/hearthmirror';

type AppLocale = 'en-US' | 'zh-CN';

type UpdateCheckResult =
  | { state: 'unsupported' }
  | { state: 'up-to-date' }
  | { state: 'update-available'; version: string }
  | { state: 'error'; message: string };

const api = {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  },
  about: {
    checkForUpdates: (): Promise<UpdateCheckResult> =>
      ipcRenderer.invoke('about:check-for-updates'),
    openLicense: (): Promise<boolean> => ipcRenderer.invoke('about:open-license'),
    openThirdPartyNotices: (): Promise<boolean> =>
      ipcRenderer.invoke('about:open-third-party-notices'),
  },
  cards: {
    findByDbfId: (dbfId: number, locale?: AppLocale): Promise<CardDef | null> =>
      ipcRenderer.invoke('cards:findByDbfId', dbfId, locale),
    findById: (id: string, locale?: AppLocale): Promise<CardDef | null> =>
      ipcRenderer.invoke('cards:findById', id, locale),
    search: (filter: SearchFilter, locale?: AppLocale): Promise<CardDef[]> =>
      ipcRenderer.invoke('cards:search', filter, locale),
  },
  cardImages: {
    get: (
      cardId: string,
      locale?: AppLocale,
    ): Promise<{ url: string; locale: string; size: string } | null> =>
      ipcRenderer.invoke('card-images:get', cardId, locale),
    getTile: (cardId: string): Promise<{ url: string } | null> =>
      ipcRenderer.invoke('card-images:getTile', cardId),
  },
  setLogos: {
    get: (setCode: string): Promise<{ url: string } | null> =>
      ipcRenderer.invoke('set-logos:get', setCode),
  },
  deck: {
    encode: (blueprint: DeckBlueprint): Promise<string> =>
      ipcRenderer.invoke('deck:encode', blueprint),
    decode: (deckstring: string): Promise<DeckBlueprint> =>
      ipcRenderer.invoke('deck:decode', deckstring),
  },
  stats: {
    getSummary: (
      filter: StatsTimeFilter,
      options?: Omit<StatsQueryOptions, 'filter' | 'now' | 'recentLimit'>,
    ): Promise<StatsSummary> => ipcRenderer.invoke('stats:get-summary', filter, options),
    listRecent: (
      filter: StatsTimeFilter,
      limit: number,
      options?: { formatFilter?: FormatFilter },
    ): Promise<MatchHistoryRecord[]> =>
      ipcRenderer.invoke('stats:list-recent', filter, limit, options),
    getSavedDeckMatchups: (
      savedDeckId: string,
      filter: StatsTimeFilter,
      options?: { formatFilter?: FormatFilter },
    ): Promise<SavedDeckMatchupStats[]> =>
      ipcRenderer.invoke('stats:get-saved-deck-matchups', savedDeckId, filter, options),
  },
  recordings: {
    list: (): Promise<MatchRecordingSummary[]> => ipcRenderer.invoke('recordings:list'),
    get: (recordingId: string): Promise<MatchRecordingDetail | null> =>
      ipcRenderer.invoke('recordings:get', recordingId),
  },
  decks: {
    list: (): Promise<DeckSummary[]> => ipcRenderer.invoke('decks:list'),
    getById: (id: string): Promise<DeckDetail | null> => ipcRenderer.invoke('decks:get-by-id', id),
    create: (input: CreateDeckInput): Promise<DeckDetail> => ipcRenderer.invoke('decks:create', input),
    update: (id: string, patch: UpdateDeckPatch): Promise<DeckDetail> =>
      ipcRenderer.invoke('decks:update', id, patch),
    duplicate: (id: string): Promise<DeckDetail> => ipcRenderer.invoke('decks:duplicate', id),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('decks:delete', id),
    importDeckstring: (text: string): Promise<DeckDetail> =>
      ipcRenderer.invoke('decks:import-deckstring', text),
    importJson: (text: string): Promise<DeckDetail> => ipcRenderer.invoke('decks:import-json', text),
    exportDeckstring: (id: string): Promise<string> =>
      ipcRenderer.invoke('decks:export-deckstring', id),
    exportJson: (id: string): Promise<string> => ipcRenderer.invoke('decks:export-json', id),
    saveFromLive: (input: LiveDeckSnapshotInput): Promise<DeckDetail> =>
      ipcRenderer.invoke('decks:save-from-live', input),
    syncFromLive: (): Promise<LiveDeckSyncResult> =>
      ipcRenderer.invoke('decks:sync-from-live'),
    setSortIndex: (id: string, sortIndex: number): Promise<void> =>
      ipcRenderer.invoke('decks:set-sort-index', id, sortIndex),
  },
  hearthmirror: {
    isAlive: (): Promise<boolean> => ipcRenderer.invoke('hearthmirror:isAlive'),
    getWindow: (): Promise<HearthstoneWindow | null> =>
      ipcRenderer.invoke('hearthmirror:get-window'),
    getBattleTag: (): Promise<BattleTag | null> => ipcRenderer.invoke('hearthmirror:getBattleTag'),
    getAccountId: (): Promise<AccountId | null> => ipcRenderer.invoke('hearthmirror:getAccountId'),
    getGameType: (): Promise<GameType | null> => ipcRenderer.invoke('hearthmirror:getGameType'),
    isSpectating: (): Promise<boolean> => ipcRenderer.invoke('hearthmirror:isSpectating'),
    isGameOver: (): Promise<boolean> => ipcRenderer.invoke('hearthmirror:isGameOver'),
    isMulligan: (): Promise<IsMulligan> => ipcRenderer.invoke('hearthmirror:isMulligan'),
    getMatchInfo: (): Promise<MatchInfo | null> => ipcRenderer.invoke('hearthmirror:getMatchInfo'),
    getMedalInfo: (): Promise<MedalInfo | null> => ipcRenderer.invoke('hearthmirror:getMedalInfo'),
    getDecks: (): Promise<Deck[] | null> => ipcRenderer.invoke('hearthmirror:getDecks'),
    getEditedDeck: (): Promise<Deck | null> => ipcRenderer.invoke('hearthmirror:getEditedDeck'),
    getCollection: (): Promise<CollectionCard[] | null> =>
      ipcRenderer.invoke('hearthmirror:getCollection'),
    getCollectionDiagnostic: (): Promise<CollectionDiagnostic | null> =>
      ipcRenderer.invoke('hearthmirror:get-collection-diagnostic'),
    getArenaDeck: (): Promise<ArenaInfo | null> => ipcRenderer.invoke('hearthmirror:getArenaDeck'),
    getBattlegroundRatingInfo: (): Promise<BattlegroundRatingInfo | null> =>
      ipcRenderer.invoke('hearthmirror:getBattlegroundRatingInfo'),
    getServerInfo: (): Promise<GameServerInfo | null> =>
      ipcRenderer.invoke('hearthmirror:getServerInfo'),
    // Phase 7 in-match observability
    getBoardState: (): Promise<BoardState | null> =>
      ipcRenderer.invoke('hearthmirror:getBoardState'),
    getHandState: (): Promise<HandState | null> =>
      ipcRenderer.invoke('hearthmirror:getHandState'),
    getDeckState: (): Promise<DeckState | null> =>
      ipcRenderer.invoke('hearthmirror:getDeckState'),
    getOpponentSecrets: (): Promise<OpponentSecrets | null> =>
      ipcRenderer.invoke('hearthmirror:getOpponentSecrets'),
    getChoices: (): Promise<Choices | null> =>
      ipcRenderer.invoke('hearthmirror:getChoices'),
    getSelectedDeckId: (): Promise<SelectedDeck | null> =>
      ipcRenderer.invoke('hearthmirror:getSelectedDeckId'),
  },
  playerProfile: {
    get: (): Promise<{
      battleTag: BattleTag;
      accountId: AccountId | null;
      lastSeenAt: number;
    } | null> => ipcRenderer.invoke('player-profile:get'),
  },
  deckTracker: {
    getSnapshot: (): Promise<DeckTrackerSnapshot | null> =>
      ipcRenderer.invoke('deck-tracker:get-snapshot'),
    selectDeck: (deckId: number): Promise<void> =>
      ipcRenderer.invoke('deck-tracker:select-deck', deckId),
    selectSavedDeck: (savedDeckId: string, savedDeckVersion: number): Promise<void> =>
      ipcRenderer.invoke('deck-tracker:select-saved-deck', savedDeckId, savedDeckVersion),
    clearSavedDeck: (): Promise<void> =>
      ipcRenderer.invoke('deck-tracker:clear-saved-deck'),
    cancelSelection: (): Promise<void> =>
      ipcRenderer.invoke('deck-tracker:cancel-selection'),
    /** Subscribe to per-tick snapshot pushes; returns an unsubscribe function. */
    onStateChange: (cb: (snapshot: DeckTrackerSnapshot) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, snapshot: DeckTrackerSnapshot): void => cb(snapshot);
      ipcRenderer.on('deck-tracker:state', handler);
      return () => ipcRenderer.removeListener('deck-tracker:state', handler);
    },
    /** Subscribe to typed events (match-started / match-ended / needs-deck-selection / error). */
    onEvent: (cb: (event: DeckTrackerEvent) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, event: DeckTrackerEvent): void => cb(event);
      ipcRenderer.on('deck-tracker:event', handler);
      return () => ipcRenderer.removeListener('deck-tracker:event', handler);
    },
  },
  hearthwatcher: {
    getStatus: (): Promise<HearthWatcherDiagnostic | null> =>
      ipcRenderer.invoke('hearthwatcher:get-status'),
    onStatus: (cb: (status: HearthWatcherDiagnostic) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, status: HearthWatcherDiagnostic): void => cb(status);
      ipcRenderer.on('hearthwatcher:status', handler);
      return () => ipcRenderer.removeListener('hearthwatcher:status', handler);
    },
    onEvent: (cb: (event: PowerEvent) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, event: PowerEvent): void => cb(event);
      ipcRenderer.on('hearthwatcher:event', handler);
      return () => ipcRenderer.removeListener('hearthwatcher:event', handler);
    },
  },
  collection: {
    getProgress: (): Promise<{
      standard: SetProgress[];
      wild: SetProgress[];
      mirrorAlive: boolean;
      source: 'live' | 'cache' | 'empty';
      lastUpdatedAt: number | null;
    }> => ipcRenderer.invoke('collection:get-progress'),
  },
  overlay: {
    setEnabled: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke('overlay:set-enabled', enabled),
    setEnabledOpponent: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke('overlay:set-enabled-opponent', enabled),
    closeFromWindow: (which: 'player' | 'opponent'): Promise<void> =>
      ipcRenderer.invoke('overlay:close-from-window', which),
    onDisabledByWindow: (cb: (which: 'player' | 'opponent') => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, which: 'player' | 'opponent'): void => cb(which);
      ipcRenderer.on('overlay:disabled-by-window', handler);
      return () => ipcRenderer.removeListener('overlay:disabled-by-window', handler);
    },
  },
  opponentDeckPrediction: {
    get: (): Promise<OpponentDeckPrediction[]> =>
      ipcRenderer.invoke('opponent-deck-prediction:get'),
    onUpdate: (cb: (predictions: OpponentDeckPrediction[]) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, predictions: OpponentDeckPrediction[]): void =>
        cb(predictions);
      ipcRenderer.on('opponent-deck-prediction:update', handler);
      return () => ipcRenderer.removeListener('opponent-deck-prediction:update', handler);
    },
  },
  popularDecks: {
    list: (): Promise<PopularDecksListResult> => ipcRenderer.invoke('popular-decks:list'),
    syncStart: (): Promise<PopularDecksSyncStartResult> =>
      ipcRenderer.invoke('popular-decks:sync-start'),
    syncStatus: (): Promise<PopularDecksSyncStatus> =>
      ipcRenderer.invoke('popular-decks:sync-status'),
    onSyncProgress: (cb: (progress: PopularDecksSyncProgress) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, progress: PopularDecksSyncProgress): void =>
        cb(progress);
      ipcRenderer.on('popular-decks:sync-progress', handler);
      return () => ipcRenderer.removeListener('popular-decks:sync-progress', handler);
    },
  },
  cardPreview: {
    show: (
      cardId: string,
      anchor: { x: number; y: number; width: number; height: number; side: 'left' | 'right' },
    ): Promise<void> => ipcRenderer.invoke('card-preview:show', cardId, anchor),
    showPool: (
      cardIds: readonly string[],
      anchor: { x: number; y: number; width: number; height: number; side: 'left' | 'right' },
    ): Promise<void> => ipcRenderer.invoke('card-preview:show-pool', cardIds, anchor),
    hide: (): Promise<void> => ipcRenderer.invoke('card-preview:hide'),
    onSetCard: (cb: (cardId: string) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, cardId: string): void => cb(cardId);
      ipcRenderer.on('card-preview:set-card', handler);
      return () => ipcRenderer.removeListener('card-preview:set-card', handler);
    },
    onSetPool: (cb: (cardIds: readonly string[]) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, cardIds: readonly string[]): void => cb(cardIds);
      ipcRenderer.on('card-preview:set-pool', handler);
      return () => ipcRenderer.removeListener('card-preview:set-pool', handler);
    },
  },
};

contextBridge.exposeInMainWorld('hdt', api);

export type HdtApi = typeof api;
