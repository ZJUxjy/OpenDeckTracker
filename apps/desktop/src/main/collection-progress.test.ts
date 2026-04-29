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
});
