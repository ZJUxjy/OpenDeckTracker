import { app, ipcMain } from 'electron';
import {
  encodeDeck,
  decodeDeck,
  type DeckBlueprint,
  type SearchFilter,
} from '@hdt/hearthdb';
import { ensureCardDb } from './cards';
import { getHearthMirror } from './hearthmirror';

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

  const hm = () => getHearthMirror();
  const swallow = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); }
    catch (e) { console.error(`[hearthmirror:${label}]`, e); return fallback; }
  };

  ipcMain.handle('hearthmirror:isAlive', () => swallow('isAlive', () => hm().isAlive(), false));
  ipcMain.handle('hearthmirror:getBattleTag', () => swallow('getBattleTag', () => hm().getBattleTag(), null));
  ipcMain.handle('hearthmirror:getAccountId', () => swallow('getAccountId', () => hm().getAccountId(), null));
  ipcMain.handle('hearthmirror:getGameType', () => swallow('getGameType', () => hm().getGameType(), 0));
  ipcMain.handle('hearthmirror:isSpectating', () => swallow('isSpectating', () => hm().isSpectating(), false));
  ipcMain.handle('hearthmirror:isGameOver', () => swallow('isGameOver', () => hm().isGameOver(), false));
  ipcMain.handle('hearthmirror:isMulligan', () => swallow('isMulligan', () => hm().isMulligan(), false));
  ipcMain.handle('hearthmirror:dumpClass', (_, className: string) =>
    swallow('dumpClass', () => hm().dumpClass(className), []));
  ipcMain.handle('hearthmirror:listServices', () => swallow('listServices', () => hm().listServices(), []));
  ipcMain.handle('hearthmirror:getMatchInfo', () => swallow('getMatchInfo', () => hm().getMatchInfo(), null));
  ipcMain.handle('hearthmirror:getMedalInfo', () => swallow('getMedalInfo', () => hm().getMedalInfo(), null));
  ipcMain.handle('hearthmirror:getDecks', () => swallow('getDecks', () => hm().getDecks(), null));
  ipcMain.handle('hearthmirror:getCollection', () => swallow('getCollection', () => hm().getCollection(), null));
  ipcMain.handle('hearthmirror:getArenaDeck', () => swallow('getArenaDeck', () => hm().getArenaDeck(), null));
  ipcMain.handle('hearthmirror:getBattlegroundRatingInfo',
    () => swallow('getBattlegroundRatingInfo', () => hm().getBattlegroundRatingInfo(), null));
  ipcMain.handle('hearthmirror:getServerInfo', () => swallow('getServerInfo', () => hm().getServerInfo(), null));
}
