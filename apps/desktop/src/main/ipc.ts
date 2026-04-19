import { app, ipcMain } from 'electron';
import {
  encodeDeck,
  decodeDeck,
  type DeckBlueprint,
  type SearchFilter,
} from '@hdt/hearthdb';
import { ensureCardDb } from './cards';

export function registerIpc(): void {
  ipcMain.handle('app:getVersion', () => app.getVersion());

  ipcMain.handle('cards:findByDbfId', async (_, dbfId: number) => {
    try {
      const db = await ensureCardDb();
      return db.findByDbfId(dbfId) ?? null;
    } catch (e) {
      console.error('[ipc cards:findByDbfId]', (e as Error).message);
      return null;
    }
  });

  ipcMain.handle('cards:findById', async (_, id: string) => {
    try {
      const db = await ensureCardDb();
      return db.findById(id) ?? null;
    } catch (e) {
      console.error('[ipc cards:findById]', (e as Error).message);
      return null;
    }
  });

  ipcMain.handle('cards:search', async (_, filter: SearchFilter) => {
    try {
      const db = await ensureCardDb();
      return db.search(filter);
    } catch (e) {
      console.error('[ipc cards:search]', (e as Error).message);
      return [];
    }
  });

  ipcMain.handle('deck:encode', (_, blueprint: DeckBlueprint) => encodeDeck(blueprint));
  ipcMain.handle('deck:decode', (_, deckstring: string) => decodeDeck(deckstring));
}
