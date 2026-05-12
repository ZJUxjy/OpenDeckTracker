import { ipcMain } from 'electron';
import { computeSetProgress, maxCopiesForRarity, type SetProgress } from '@hdt/core';
import type { CardDb, CardDef } from '@hdt/hearthdb';
import type { CollectionCard } from '@hdt/hearthmirror';
import type { CollectionSnapshotStore } from './collection-snapshot-store';

export type CollectionProgressSource = 'live' | 'cache' | 'empty';

export interface CollectionProgressResponse {
  standard: SetProgress[];
  wild: SetProgress[];
  mirrorAlive: boolean;
  source: CollectionProgressSource;
  lastUpdatedAt: number | null;
  lastSyncedAt: number | null;
  liveReadSkipped: boolean;
  ownedCards: CollectionCard[];
}

export interface CollectionProgressRequest {
  /** Manual sync bypasses the cache cooldown and attempts a fresh live read. */
  force?: boolean;
  /** Automatic requests skip live reflection while a cache or recent live-read attempt is within this window. */
  cooldownMs?: number;
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
  now?: () => number;
}

const DEFAULT_LIVE_READ_RETRY_DELAYS_MS = [250, 750, 1_500] as const;
const CORE_SET_CODE = 'SET_1810';

export function registerCollectionProgressIpc(deps: CollectionProgressDeps): void {
  let lastAutomaticLiveReadAttemptAt = 0;

  ipcMain.handle(
    'collection:get-progress',
    async (_event, request?: CollectionProgressRequest): Promise<CollectionProgressResponse> => {
      const allCollectible = deps.cardDb.search({ collectible: true, limit: 100_000 });
      const now = deps.now?.() ?? Date.now();
      const force = request?.force === true;
      const cooldownMs = Math.max(0, request?.cooldownMs ?? 0);
      const cachedBeforeRead = deps.snapshotStore?.get() ?? null;
      const canUseCooldown = !force && cooldownMs > 0;

      if (
        canUseCooldown &&
        (
          (cachedBeforeRead !== null && now - cachedBeforeRead.lastSyncedAt < cooldownMs) ||
          (lastAutomaticLiveReadAttemptAt > 0 && now - lastAutomaticLiveReadAttemptAt < cooldownMs)
        )
      ) {
        return buildProgressResponse({
          allCollectible,
          owned: cachedBeforeRead?.cards ?? [],
          mirrorAlive: false,
          source: cachedBeforeRead === null ? 'empty' : 'cache',
          lastUpdatedAt: cachedBeforeRead?.lastUpdatedAt ?? null,
          lastSyncedAt: cachedBeforeRead?.lastSyncedAt ?? null,
          liveReadSkipped: true,
        });
      }

      if (canUseCooldown) lastAutomaticLiveReadAttemptAt = now;

      const liveCollection = await readLiveCollection(deps);
      const liveOk = liveCollection !== null && liveCollection.length > 0;

      let source: CollectionProgressSource;
      let owned: readonly CollectionCard[] = [];
      let lastUpdatedAt: number | null = null;
      let lastSyncedAt: number | null = null;
      let mirrorAlive: boolean;

      if (liveOk) {
        mirrorAlive = true;
        owned = liveCollection;
        source = 'live';
        if (deps.snapshotStore !== undefined) {
          try {
            const saved = deps.snapshotStore.save(liveCollection, now);
            lastUpdatedAt = saved.lastUpdatedAt;
            lastSyncedAt = saved.lastSyncedAt;
          } catch (err) {
            lastUpdatedAt = null;
            lastSyncedAt = null;
            console.error('[collection-progress] cache save failed', err);
          }
        }
      } else {
        mirrorAlive = false;
        const cached = cachedBeforeRead ?? deps.snapshotStore?.get() ?? null;
        if (cached !== null) {
          owned = cached.cards;
          source = 'cache';
          lastUpdatedAt = cached.lastUpdatedAt;
          lastSyncedAt = cached.lastSyncedAt;
        } else {
          source = 'empty';
        }
      }

      return buildProgressResponse({
        allCollectible,
        owned,
        mirrorAlive,
        source,
        lastUpdatedAt,
        lastSyncedAt,
        liveReadSkipped: false,
      });
    },
  );
}

function buildProgressResponse({
  allCollectible,
  owned,
  mirrorAlive,
  source,
  lastUpdatedAt,
  lastSyncedAt,
  liveReadSkipped,
}: {
  allCollectible: readonly CardDef[];
  owned: readonly CollectionCard[];
  mirrorAlive: boolean;
  source: CollectionProgressSource;
  lastUpdatedAt: number | null;
  lastSyncedAt: number | null;
  liveReadSkipped: boolean;
}): CollectionProgressResponse {
  const displayOwned = withCoreSetGrant(allCollectible, owned);
  const ownedByDbfId = new Map<number, number>();
  for (const card of displayOwned) {
    const existing = ownedByDbfId.get(card.dbfId) ?? 0;
    ownedByDbfId.set(card.dbfId, existing + card.count);
  }

  const all = computeSetProgress(allCollectible, ownedByDbfId);
  const standard: SetProgress[] = [];
  const wild: SetProgress[] = [];
  for (const row of all) {
    (row.format === 'standard' ? standard : wild).push(row);
  }

  return {
    standard,
    wild,
    mirrorAlive,
    source,
    lastUpdatedAt,
    lastSyncedAt,
    liveReadSkipped,
    ownedCards: displayOwned,
  };
}

function withCoreSetGrant(
  allCollectible: readonly CardDef[],
  owned: readonly CollectionCard[],
): CollectionCard[] {
  const coreCards = allCollectible.filter((card) =>
    card.collectible && card.set === CORE_SET_CODE,
  );
  if (coreCards.length === 0) return owned.map((card) => ({ ...card }));

  const coreDbfIds = new Set(coreCards.map((card) => card.dbfId));
  const nonCoreOwned: CollectionCard[] = [];
  const coreOwnedByDbfId = new Map<number, number>();
  for (const card of owned) {
    if (coreDbfIds.has(card.dbfId)) {
      coreOwnedByDbfId.set(card.dbfId, (coreOwnedByDbfId.get(card.dbfId) ?? 0) + card.count);
    } else {
      nonCoreOwned.push({ ...card });
    }
  }

  for (const card of coreCards) {
    const legalMax = maxCopiesForRarity(card.rarity ?? 'FREE');
    coreOwnedByDbfId.set(card.dbfId, legalMax);
  }

  const coreOwned = Array.from(coreOwnedByDbfId.entries())
    .sort(([a], [b]) => a - b)
    .map(([dbfId, count]) => ({ dbfId, count, premium: 0 }));
  return [...nonCoreOwned, ...coreOwned];
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
