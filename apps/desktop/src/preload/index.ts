import { contextBridge, ipcRenderer } from 'electron';
import type { CardDef, DeckBlueprint, SearchFilter } from '@hdt/hearthdb';

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
};

contextBridge.exposeInMainWorld('hdt', api);

export type HdtApi = typeof api;
