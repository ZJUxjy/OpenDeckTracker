import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { CardDef, DeckBlueprint, SearchFilter } from '@hdt/hearthdb';
import type { DeckTrackerEvent, DeckTrackerSnapshot } from '@hdt/core';
import type {
  AccountId,
  ArenaInfo,
  BattleTag,
  BattlegroundRatingInfo,
  BoardState,
  Choices,
  CollectionCard,
  Deck,
  DeckState,
  GameServerInfo,
  GameType,
  HandState,
  IsMulligan,
  MatchInfo,
  MedalInfo,
  OpponentSecrets,
} from '@hdt/hearthmirror';

const api = {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  },
  cards: {
    findByDbfId: (dbfId: number): Promise<CardDef | null> =>
      ipcRenderer.invoke('cards:findByDbfId', dbfId),
    findById: (id: string): Promise<CardDef | null> =>
      ipcRenderer.invoke('cards:findById', id),
    search: (filter: SearchFilter): Promise<CardDef[]> =>
      ipcRenderer.invoke('cards:search', filter),
  },
  deck: {
    encode: (blueprint: DeckBlueprint): Promise<string> =>
      ipcRenderer.invoke('deck:encode', blueprint),
    decode: (deckstring: string): Promise<DeckBlueprint> =>
      ipcRenderer.invoke('deck:decode', deckstring),
  },
  hearthmirror: {
    isAlive: (): Promise<boolean> => ipcRenderer.invoke('hearthmirror:isAlive'),
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
  },
  deckTracker: {
    getSnapshot: (): Promise<DeckTrackerSnapshot | null> =>
      ipcRenderer.invoke('deck-tracker:get-snapshot'),
    selectDeck: (deckId: number): Promise<void> =>
      ipcRenderer.invoke('deck-tracker:select-deck', deckId),
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
};

contextBridge.exposeInMainWorld('hdt', api);

export type HdtApi = typeof api;
