import { ipcMain } from 'electron';
import { computeSetProgress, type SetProgress } from '@hdt/core';
import type { CardDb } from '@hdt/hearthdb';
import type { CollectionCard } from '@hdt/hearthmirror';
import type { CollectionSnapshotStore } from './collection-snapshot-store';

export type CollectionProgressSource = 'live' | 'cache' | 'empty';

export interface CollectionProgressResponse {
  standard: SetProgress[];
  wild: SetProgress[];
  mirrorAlive: boolean;
  source: CollectionProgressSource;
  lastUpdatedAt: number | null;
}

export interface CollectionProgressDeps {
  cardDb: CardDb;
  getCollection: () => Promise<CollectionCard[] | null>;
  /** Optional cache; when provided, fall back to cached counts when live read fails. */
  snapshotStore?: CollectionSnapshotStore;
  /**
   * Hearthstone can expose CollectionManager before m_collectibleCards is
   * populated. Empty live reads are treated as "not ready" and retried.
   */
  liveReadRetryDelaysMs?: readonly number[];
}

const DEFAULT_LIVE_READ_RETRY_DELAYS_MS = [250, 750, 1_500] as const;

export function registerCollectionProgressIpc(deps: CollectionProgressDeps): void {
  ipcMain.handle('collection:get-progress', async (): Promise<CollectionProgressResponse> => {
    const allCollectible = deps.cardDb.search({ collectible: true, limit: 100_000 });

    const liveCollection = await readLiveCollection(deps);
    const liveOk = liveCollection !== null && liveCollection.length > 0;

    let source: CollectionProgressSource;
    let owned: readonly CollectionCard[] = [];
    let lastUpdatedAt: number | null = null;
    let mirrorAlive: boolean;

    if (liveOk) {
      mirrorAlive = true;
      owned = liveCollection;
      source = 'live';
      if (deps.snapshotStore !== undefined) {
        try {
          lastUpdatedAt = Date.now();
          const saved = deps.snapshotStore.save(liveCollection, lastUpdatedAt);
          lastUpdatedAt = saved.lastUpdatedAt;
        } catch (err) {
          lastUpdatedAt = null;
          console.error('[collection-progress] cache save failed', err);
        }
      }
    } else {
      mirrorAlive = false;
      const cached = deps.snapshotStore?.get() ?? null;
      if (cached !== null) {
        owned = cached.cards;
        source = 'cache';
        lastUpdatedAt = cached.lastUpdatedAt;
      } else {
        source = 'empty';
      }
    }

    const ownedByDbfId = new Map<number, number>();
    for (const card of owned) {
      const existing = ownedByDbfId.get(card.dbfId) ?? 0;
      ownedByDbfId.set(card.dbfId, existing + card.count);
    }

    const all = computeSetProgress(allCollectible, ownedByDbfId);
    const standard: SetProgress[] = [];
    const wild: SetProgress[] = [];
    for (const row of all) {
      (row.format === 'standard' ? standard : wild).push(row);
    }

    return { standard, wild, mirrorAlive, source, lastUpdatedAt };
  });
}

async function readLiveCollection(
  deps: CollectionProgressDeps,
): Promise<CollectionCard[] | null> {
  const delays = deps.liveReadRetryDelaysMs ?? DEFAULT_LIVE_READ_RETRY_DELAYS_MS;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const live = await deps.getCollection();
      if (live === null || live.length > 0 || attempt >= delays.length) {
        return live;
      }
    } catch {
      return null;
    }
    await sleep(delays[attempt]!);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
