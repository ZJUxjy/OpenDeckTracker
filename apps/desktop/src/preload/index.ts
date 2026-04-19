import { contextBridge, ipcRenderer } from 'electron';
import type { CardDef, DeckBlueprint, SearchFilter } from '@hdt/hearthdb';
import type {
  ArenaInfo,
  AccountId,
  BattleTag,
  BattlegroundRatingInfo,
  Card,
  Deck,
  GameServerInfo,
  MatchInfo,
  MedalInfo,
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
    getGameType: (): Promise<number> => ipcRenderer.invoke('hearthmirror:getGameType'),
    isSpectating: (): Promise<boolean> => ipcRenderer.invoke('hearthmirror:isSpectating'),
    isGameOver: (): Promise<boolean> => ipcRenderer.invoke('hearthmirror:isGameOver'),
    getMatchInfo: (): Promise<MatchInfo | null> => ipcRenderer.invoke('hearthmirror:getMatchInfo'),
    getMedalInfo: (): Promise<MedalInfo | null> => ipcRenderer.invoke('hearthmirror:getMedalInfo'),
    getDecks: (): Promise<Deck[] | null> => ipcRenderer.invoke('hearthmirror:getDecks'),
    getCollection: (): Promise<Card[] | null> => ipcRenderer.invoke('hearthmirror:getCollection'),
    getArenaDeck: (): Promise<ArenaInfo | null> => ipcRenderer.invoke('hearthmirror:getArenaDeck'),
    getBattlegroundRatingInfo: (): Promise<BattlegroundRatingInfo | null> =>
      ipcRenderer.invoke('hearthmirror:getBattlegroundRatingInfo'),
    getServerInfo: (): Promise<GameServerInfo | null> => ipcRenderer.invoke('hearthmirror:getServerInfo'),
  },
};

contextBridge.exposeInMainWorld('hdt', api);

export type HdtApi = typeof api;
