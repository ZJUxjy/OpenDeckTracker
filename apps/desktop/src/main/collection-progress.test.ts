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

async function invoke(): Promise<unknown> {
  const handler = mocks.handlers.get('collection:get-progress');
  if (!handler) throw new Error('handler not registered');
  return await handler({});
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

    const result = (await invoke()) as { standard: unknown[]; wild: unknown[]; mirrorAlive: boolean };

    expect(result.mirrorAlive).toBe(true);
    expect(result.standard).toHaveLength(1);
    expect(result.wild).toHaveLength(1);
    expect(result.standard[0]).toMatchObject({
      setCode: 'SET_1810',
      ownedCopies: 1 + 2,
      ownedUniqueCards: 2,
    });
    expect(result.wild[0]).toMatchObject({ setCode: 'SET_12', ownedCopies: 0 });
  });

  it('returns mirrorAlive=false with zero owned counts when getCollection returns null', async () => {
    registerCollectionProgressIpc({
      cardDb: makeCardDb(sampleCards) as never,
      getCollection: async () => null,
    });

    const result = (await invoke()) as {
      standard: { ownedCopies: number }[];
      wild: { ownedCopies: number }[];
      mirrorAlive: boolean;
    };

    expect(result.mirrorAlive).toBe(false);
    expect(result.standard.every((r) => r.ownedCopies === 0)).toBe(true);
    expect(result.wild.every((r) => r.ownedCopies === 0)).toBe(true);
    expect(result.standard.length + result.wild.length).toBeGreaterThan(0);
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
      get: vi.fn(() => ({ cards: cachedCards, lastUpdatedAt: 1234 })),
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
      standard: { setCode: string; ownedCopies: number }[];
    };
    expect(result.mirrorAlive).toBe(false);
    expect(result.source).toBe('cache');
    expect(result.lastUpdatedAt).toBe(1234);
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
        stored ? { cards: [...stored.cards], lastUpdatedAt: stored.ts } : null,
      ),
      save: vi.fn((cards: readonly CollectionCard[], now?: number) => {
        const h = computeHash(cards);
        if (stored && stored.hash === h) {
          return { cards: [...cards], lastUpdatedAt: stored.ts };
        }
        stored = { cards: [...cards], hash: h, ts: now ?? 0 };
        return { cards: [...cards], lastUpdatedAt: stored.ts };
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
      standard: { ownedCopies: number }[];
    };
    expect(result.mirrorAlive).toBe(false);
    expect(result.source).toBe('empty');
    expect(result.lastUpdatedAt).toBeNull();
    expect(result.standard.every((r) => r.ownedCopies === 0)).toBe(true);
  });
});
