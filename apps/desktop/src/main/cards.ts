import { join } from 'node:path';
import { loadCards, type CardDb } from '@hdt/hearthdb';

let dbPromise: Promise<CardDb> | null = null;

export function ensureCardDb(): Promise<CardDb> {
  if (!dbPromise) {
    const jsonPath = join(process.cwd(), 'data/cards/cards.collectible.enUS.json');
    dbPromise = loadCards(jsonPath);
    dbPromise.catch((e: Error) => {
      // log once on first failure; subsequent IPC handlers will see the same rejected promise
      console.error('[cards] failed to load cards.collectible.enUS.json:', e.message);
      console.error(
        "[cards] Run 'pnpm cards:download' to fetch the data, then restart the app.",
      );
    });
  }
  return dbPromise;
}
