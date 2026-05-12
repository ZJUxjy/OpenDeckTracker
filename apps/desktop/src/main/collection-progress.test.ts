import { describe, expect, it, vi } from 'vitest';
import type { CardDef } from '@hdt/hearthdb';
import type { CollectionCard } from '@hdt/hearthmirror';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  return {
    handlers,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, async (...args) => handler(...args));
      }),
    },
  };
});

vi.mock('electron', () => ({
  ipcMain: mocks.ipcMain,
}));

const { registerCollectionProgressIpc } = await import('./collection-progress');

function makeCardDb(cards: CardDef[]): { search: () => CardDef[] } {
  return { search: () => cards };
}

async function invoke(options?: { force?: boolean; cooldownMs?: number }): Promise<unknown> {
  const handler = mocks.handlers.get('collection:get-progress');
  if (!handler) throw new Error('handler not registered');
  return await handler({}, options);
}

const sampleCards: CardDef[] = [
  {
    id: 'CARD_A',
    dbfId: 1,
    name: 'A',
    cardClass: 'NEUTRAL',
    type: 'MINION',
    collectible: true,
    rarity: 'LEGENDARY',
    set: 'SET_1810', // Standard
  },
  {
    id: 'CARD_B',
    dbfId: 2,
    name: 'B',
    cardClass: 'NEUTRAL',
    type: 'MINION',
    collectible: true,
    rarity: 'COMMON',
    set: 'SET_1810',
  },
  {
    id: 'CARD_C',
    dbfId: 3,
    name: 'C',
    cardClass: 'NEUTRAL',
    type: 'MINION',
    collectible: true,
    rarity: 'COMMON',
    set: 'SET_12', // Wild
  },
];

const coreGrantedCards: CollectionCard[] = [
  { dbfId: 1, count: 1, premium: 0 },
  { dbfId: 2, count: 2, premium: 0 },
];

describe('collection:get-progress IPC handler', () => {
  it('returns standard + wild buckets and mirrorAlive=true on happy path', async () => {
    const owned: CollectionCard[] = [
      { dbfId: 1, count: 1, premium: 0 },
      { dbfId: 2, count: 2, premium: 0 },
    ];
    registerCollectionProgressIpc({
      cardDb: makeCardDb(sampleCards) as never,
      getCollection: async () => owned,
    });

    const result = (await invoke()) as {
      standard: unknown[];
      wild: unknown[];
      mirrorAlive: boolean;
      ownedCards: CollectionCard[];
    };

    expect(result.mirrorAlive).toBe(true);
    expect(result.ownedCards).toEqual(owned);
    expect(result.standard).toHaveLength(1);
    expect(result.wild).toHaveLength(1);
    expect(result.standard[0]).toMatchObject({
      setCode: 'SET_1810',
      ownedCopies: 1 + 2,
      ownedUniqueCards: 2,
    });
    expect(result.wild[0]).toMatchObject({ setCode: 'SET_12', ownedCopies: 0 });
  });

  it('returns mirrorAlive=false while treating Core as fully owned when getCollection returns null', async () => {
    registerCollectionProgressIpc({
      cardDb: makeCardDb(sampleCards) as never,
      getCollection: async () => null,
    });

    const result = (await invoke()) as {
      standard: { setCode: string; ownedCopies: number }[];
      wild: { ownedCopies: number }[];
      mirrorAlive: boolean;
    };

    expect(result.mirrorAlive).toBe(false);
    expect(result.standard.find((r) => r.setCode === 'SET_1810')?.ownedCopies).toBe(3);
    expect(result.wild.every((r) => r.ownedCopies === 0)).toBe(true);
    expect(result.standard.length + result.wild.length).toBeGreaterThan(0);
  });

  it('retries an empty live collection before falling back', async () => {
    const owned: CollectionCard[] = [{ dbfId: 1, count: 1, premium: 0 }];
    const responses: Array<CollectionCard[] | null> = [[], owned];
    const getCollection = vi.fn(async () => responses.shift() ?? null);
    registerCollectionProgressIpc({
      cardDb: makeCardDb(sampleCards) as never,
      getCollection,
      liveReadRetryDelaysMs: [0],
    });

    const result = (await invoke()) as {
      mirrorAlive: boolean;
      source: string;
      standard: { setCode: string; ownedCopies: number }[];
    };

    expect(getCollection).toHaveBeenCalledTimes(2);
    expect(result.mirrorAlive).toBe(true);
    expect(result.source).toBe('live');
    expect(result.standard.find((r) => r.setCode === 'SET_1810')?.ownedCopies).toBe(3);
  });

  it('caps generated Core ownership at the legal max copies', async () => {
    const owned: CollectionCard[] = [
      { dbfId: 2, count: 4, premium: 1 },
      { dbfId: 3, count: 1, premium: 0 },
    ];
    registerCollectionProgressIpc({
      cardDb: makeCardDb(sampleCards) as never,
      getCollection: async () => owned,
    });

    const result = (await invoke()) as {
      ownedCards: CollectionCard[];
      standard: { setCode: string; ownedCopies: number }[];
      wild: { setCode: string; ownedCopies: number }[];
    };

    expect(result.ownedCards).toEqual([
      { dbfId: 3, count: 1, premium: 0 },
      ...coreGrantedCards,
    ]);
    expect(result.standard.find((r) => r.setCode === 'SET_1810')?.ownedCopies).toBe(3);
    expect(result.wild.find((r) => r.setCode === 'SET_12')?.ownedCopies).toBe(1);
  });

  it('returns mirrorAlive=false without throwing when getCollection rejects', async () => {
    registerCollectionProgressIpc({
      cardDb: makeCardDb(sampleCards) as never,
      getCollection: async () => {
        throw new Error('boom');
      },
    });

    const result = (await invoke()) as { mirrorAlive: boolean };
    expect(result.mirrorAlive).toBe(false);
  });

  it('is idempotent — two invocations return equal output for equal inputs', async () => {
    const owned: CollectionCard[] = [{ dbfId: 1, count: 1, premium: 0 }];
    registerCollectionProgressIpc({
      cardDb: makeCardDb(sampleCards) as never,
      getCollection: async () => owned,
    });

    const a = await invoke();
    const b = await invoke();
    expect(a).toEqual(b);
  });

  it('reports source=live and refreshes the snapshot cache on success', async () => {
    const owned: CollectionCard[] = [{ dbfId: 1, count: 1, premium: 0 }];
    const save = vi.fn((cards: readonly CollectionCard[], now?: number) => ({
      cards: [...cards],
      lastUpdatedAt: now ?? 0,
      lastSyncedAt: now ?? 0,
    }));
    const snapshotStore = {
      get: vi.fn(() => null),
      save,
      close: vi.fn(),
    };
    registerCollectionProgressIpc({
      cardDb: makeCardDb(sampleCards) as never,
      getCollection: async () => owned,
      snapshotStore: snapshotStore as never,
    });

    const result = (await invoke()) as { mirrorAlive: boolean; source: string };
    expect(result.mirrorAlive).toBe(true);
    expect(result.source).toBe('live');
    expect(save).toHaveBeenCalledWith(owned, expect.any(Number));
  });

  it('reports source=cache when live read fails but cache exists', async () => {
    // dbfId 1 is LEGENDARY (legal max = 1), dbfId 2 is COMMON (legal max = 2).
    const cachedCards: CollectionCard[] = [
      { dbfId: 1, count: 1, premium: 0 },
      { dbfId: 2, count: 2, premium: 0 },
    ];
    const snapshotStore = {
      get: vi.fn(() => ({ cards: cachedCards, lastUpdatedAt: 1234, lastSyncedAt: 5678 })),
      save: vi.fn(),
      close: vi.fn(),
    };
    registerCollectionProgressIpc({
      cardDb: makeCardDb(sampleCards) as never,
      getCollection: async () => null,
      snapshotStore: snapshotStore as never,
    });

    const result = (await invoke()) as {
      mirrorAlive: boolean;
      source: string;
      lastUpdatedAt: number | null;
      lastSyncedAt: number | null;
      ownedCards: CollectionCard[];
      standard: { setCode: string; ownedCopies: number }[];
    };
    expect(result.mirrorAlive).toBe(false);
    expect(result.source).toBe('cache');
    expect(result.lastUpdatedAt).toBe(1234);
    expect(result.lastSyncedAt).toBe(5678);
    expect(result.ownedCards).toEqual(cachedCards);
    const standardSet = result.standard.find((s) => s.setCode === 'SET_1810');
    expect(standardSet?.ownedCopies).toBe(3);
  });

  it('collection-progress reports the snapshot\'s lastUpdatedAt unchanged when hash matches', async () => {
    const owned: CollectionCard[] = [{ dbfId: 1, count: 1, premium: 0 }];
    let stored: { cards: readonly CollectionCard[]; hash: string; ts: number } | null = null;
    const computeHash = (cards: readonly CollectionCard[]): string =>
      cards
        .slice()
        .sort((a, b) => (a.dbfId !== b.dbfId ? a.dbfId - b.dbfId : a.premium - b.premium))
        .map((c) => `${c.dbfId}:${c.premium}:${c.count}`)
        .join('|');
    const snapshotStore = {
      get: vi.fn(() =>
        stored ? { cards: [...stored.cards], lastUpdatedAt: stored.ts, lastSyncedAt: stored.ts } : null,
      ),
      save: vi.fn((cards: readonly CollectionCard[], now?: number) => {
        const h = computeHash(cards);
        if (stored && stored.hash === h) {
          return { cards: [...cards], lastUpdatedAt: stored.ts, lastSyncedAt: now ?? stored.ts };
        }
        stored = { cards: [...cards], hash: h, ts: now ?? 0 };
        return { cards: [...cards], lastUpdatedAt: stored.ts, lastSyncedAt: stored.ts };
      }),
      close: vi.fn(),
    };
    registerCollectionProgressIpc({
      cardDb: makeCardDb(sampleCards) as never,
      getCollection: async () => owned,
      snapshotStore: snapshotStore as never,
    });

    const first = (await invoke()) as { lastUpdatedAt: number };
    // Simulate elapsed time before the second invocation; the IPC
    // handler stamps `Date.now()` on entry, but the snapshot store
    // returns the original timestamp when content hasn't changed.
    await new Promise((r) => setTimeout(r, 5));
    const second = (await invoke()) as { lastUpdatedAt: number };
    expect(second.lastUpdatedAt).toBe(first.lastUpdatedAt);
  });

  it('reports source=empty when live fails and no cache exists', async () => {
    const snapshotStore = {
      get: vi.fn(() => null),
      save: vi.fn(),
      close: vi.fn(),
    };
    registerCollectionProgressIpc({
      cardDb: makeCardDb(sampleCards) as never,
      getCollection: async () => null,
      snapshotStore: snapshotStore as never,
    });

    const result = (await invoke()) as {
      mirrorAlive: boolean;
      source: string;
      lastUpdatedAt: number | null;
      lastSyncedAt: number | null;
      ownedCards: CollectionCard[];
      standard: { setCode: string; ownedCopies: number }[];
    };
    expect(result.mirrorAlive).toBe(false);
    expect(result.source).toBe('empty');
    expect(result.lastUpdatedAt).toBeNull();
    expect(result.lastSyncedAt).toBeNull();
    expect(result.ownedCards).toEqual(coreGrantedCards);
    expect(result.standard.find((r) => r.setCode === 'SET_1810')?.ownedCopies).toBe(3);
  });

  it('skips live reads during the automatic cooldown and returns cached ownership', async () => {
    const cachedCards: CollectionCard[] = [{ dbfId: 1, count: 1, premium: 0 }];
    const getCollection = vi.fn(async () => [{ dbfId: 2, count: 2, premium: 0 }]);
    const snapshotStore = {
      get: vi.fn(() => ({ cards: cachedCards, lastUpdatedAt: 10_000, lastSyncedAt: 12_000 })),
      save: vi.fn(),
      close: vi.fn(),
    };
    registerCollectionProgressIpc({
      cardDb: makeCardDb(sampleCards) as never,
      getCollection,
      snapshotStore: snapshotStore as never,
      now: () => 13_000,
    });

    const result = (await invoke({ cooldownMs: 10_000 })) as {
      source: string;
      liveReadSkipped: boolean;
      ownedCards: CollectionCard[];
      standard: { setCode: string; ownedCopies: number }[];
    };

    expect(getCollection).not.toHaveBeenCalled();
    expect(result.source).toBe('cache');
    expect(result.liveReadSkipped).toBe(true);
    expect(result.ownedCards).toEqual(coreGrantedCards);
    expect(result.standard.find((s) => s.setCode === 'SET_1810')?.ownedCopies).toBe(3);
  });

  it('skips repeated automatic live reads during cooldown even without a cache', async () => {
    let now = 20_000;
    const getCollection = vi.fn(async () => null);
    const snapshotStore = {
      get: vi.fn(() => null),
      save: vi.fn(),
      close: vi.fn(),
    };
    registerCollectionProgressIpc({
      cardDb: makeCardDb(sampleCards) as never,
      getCollection,
      snapshotStore: snapshotStore as never,
      now: () => now,
    });

    const first = (await invoke({ cooldownMs: 10_000 })) as {
      source: string;
      liveReadSkipped: boolean;
    };
    now += 1_000;
    const second = (await invoke({ cooldownMs: 10_000 })) as {
      source: string;
      liveReadSkipped: boolean;
      ownedCards: CollectionCard[];
      standard: { setCode: string; ownedCopies: number }[];
    };

    expect(getCollection).toHaveBeenCalledTimes(1);
    expect(first.source).toBe('empty');
    expect(first.liveReadSkipped).toBe(false);
    expect(second.source).toBe('empty');
    expect(second.liveReadSkipped).toBe(true);
    expect(second.ownedCards).toEqual(coreGrantedCards);
    expect(second.standard.find((r) => r.setCode === 'SET_1810')?.ownedCopies).toBe(3);
  });

  it('force=true bypasses the automatic cooldown and refreshes from live data', async () => {
    const cachedCards: CollectionCard[] = [{ dbfId: 1, count: 1, premium: 0 }];
    const liveCards: CollectionCard[] = [{ dbfId: 2, count: 2, premium: 0 }];
    const getCollection = vi.fn(async () => liveCards);
    const snapshotStore = {
      get: vi.fn(() => ({ cards: cachedCards, lastUpdatedAt: 10_000, lastSyncedAt: 12_000 })),
      save: vi.fn((cards: readonly CollectionCard[], now?: number) => ({
        cards: [...cards],
        lastUpdatedAt: now ?? 0,
        lastSyncedAt: now ?? 0,
      })),
      close: vi.fn(),
    };
    registerCollectionProgressIpc({
      cardDb: makeCardDb(sampleCards) as never,
      getCollection,
      snapshotStore: snapshotStore as never,
      now: () => 13_000,
    });

    const result = (await invoke({ force: true, cooldownMs: 10_000 })) as {
      source: string;
      liveReadSkipped: boolean;
      ownedCards: CollectionCard[];
      standard: { setCode: string; ownedCopies: number }[];
    };

    expect(getCollection).toHaveBeenCalledTimes(1);
    expect(result.source).toBe('live');
    expect(result.liveReadSkipped).toBe(false);
    expect(result.ownedCards).toEqual(coreGrantedCards);
    expect(result.standard.find((s) => s.setCode === 'SET_1810')?.ownedCopies).toBe(3);
  });
});
