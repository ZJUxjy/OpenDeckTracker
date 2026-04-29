import { ipcMain } from 'electron';
import { computeSetProgress, type SetProgress } from '@hdt/core';
import type { CardDb } from '@hdt/hearthdb';

export interface CollectionProgressResponse {
  standard: SetProgress[];
  wild: SetProgress[];
  mirrorAlive: boolean;
}

export interface CollectionProgressDeps {
  cardDb: CardDb;
  getCollection: () => Promise<import('@hdt/hearthmirror').CollectionCard[] | null>;
}

export function registerCollectionProgressIpc(deps: CollectionProgressDeps): void {
  ipcMain.handle('collection:get-progress', async (): Promise<CollectionProgressResponse> => {
    const allCollectible = deps.cardDb.search({ collectible: true, limit: 100_000 });

    let mirrorAlive = true;
    let collection: import('@hdt/hearthmirror').CollectionCard[] | null = null;
    try {
      collection = await deps.getCollection();
    } catch {
      mirrorAlive = false;
    }
    if (collection === null) {
      mirrorAlive = false;
    }

    const ownedByDbfId = new Map<number, number>();
    if (collection) {
      for (const card of collection) {
        const existing = ownedByDbfId.get(card.dbfId) ?? 0;
        ownedByDbfId.set(card.dbfId, existing + card.count);
      }
    }

    const all = computeSetProgress(allCollectible, ownedByDbfId);
    const standard: SetProgress[] = [];
    const wild: SetProgress[] = [];
    for (const row of all) {
      (row.format === 'standard' ? standard : wild).push(row);
    }

    return { standard, wild, mirrorAlive };
  });
}
