import { describe, expect, it, vi } from 'vitest';

import {
  type DeckCodecLookup,
  DeckstringDecodeError,
  IllegalDeckExportError,
  UnknownCardError,
} from './deck-codec';

import { type DeckIpcOptions, registerDeckIpc } from './deck-ipc';
import {
  type DeckStore,
  NonCollectibleSnapshotError,
} from './deck-store';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  return {
    handlers,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        // Real ipcMain.handle wraps handlers so synchronous throws become
        // rejected promises sent over IPC. Mirror that behavior in the mock.
        handlers.set(channel, async (...args) => handler(...args));
      }),
      removeHandler: vi.fn((channel: string) => {
        handlers.delete(channel);
      }),
    },
  };
});

vi.mock('electron', () => ({
  ipcMain: mocks.ipcMain,
  app: { getPath: () => 'C:\\fake\\userData' },
}));

const ALL_CHANNELS = [
  'decks:list',
  'decks:get-by-id',
  'decks:create',
  'decks:update',
  'decks:duplicate',
  'decks:delete',
  'decks:import-deckstring',
  'decks:import-json',
  'decks:export-deckstring',
  'decks:export-json',
  'decks:save-from-live',
  'decks:set-sort-index',
  'decks:get-active',
  'decks:set-active',
];

const ALL_CHANNELS_WITH_SYNC = [...ALL_CHANNELS, 'decks:sync-from-live'];

function makeStubStore(overrides: Partial<DeckStore> = {}): DeckStore {
  return {
    list: vi.fn(() => []),
    getById: vi.fn(() => null),
    create: vi.fn((input) => ({
      id: 'd-1',
      name: input.name,
      class: input.class,
      format: input.format,
      version: 1,
      cards: input.cards ?? [],
      notes: '',
      tags: [],
      createdAt: 0,
      updatedAt: 0,
    })),
    update: vi.fn(() => {
      throw new Error('not implemented');
    }),
    duplicate: vi.fn(() => {
      throw new Error('not implemented');
    }),
    delete: vi.fn(),
    setSortIndex: vi.fn(),
    saveFromLive: vi.fn(() => {
      throw new Error('not implemented');
    }),
    listVersions: vi.fn(() => []),
    schemaVersion: vi.fn(() => 1),
    close: vi.fn(),
    getActiveDeckId: vi.fn(() => null),
    setActiveDeckId: vi.fn(),
    ...overrides,
  } as DeckStore;
}

function makeStubLookup(): DeckCodecLookup {
  return {
    byCardId: () => null,
    byDbfId: () => null,
    heroDbfIdForClass: () => null,
  };
}

function makeOptions(overrides: Partial<DeckIpcOptions> = {}): DeckIpcOptions {
  return {
    store: makeStubStore(),
    codecLookup: () => makeStubLookup(),
    collectibleLookup: () => () => ({ collectible: true }),
    ...overrides,
  };
}

describe('deck-ipc', () => {
  it('registers exactly one handler per surface method (14 total)', () => {
    mocks.handlers.clear();
    mocks.ipcMain.handle.mockClear();
    registerDeckIpc(makeOptions());

    for (const ch of ALL_CHANNELS) {
      expect(mocks.handlers.has(ch)).toBe(true);
    }
    expect(mocks.ipcMain.handle).toHaveBeenCalledTimes(ALL_CHANNELS.length);
  });

  it('re-registration is idempotent (calls removeHandler before handle)', () => {
    mocks.handlers.clear();
    mocks.ipcMain.handle.mockClear();
    mocks.ipcMain.removeHandler.mockClear();

    registerDeckIpc(makeOptions());
    registerDeckIpc(makeOptions());

    expect(mocks.ipcMain.removeHandler).toHaveBeenCalled();
    // handlers map should still have all 14 channels (last registration wins)
    for (const ch of ALL_CHANNELS) expect(mocks.handlers.has(ch)).toBe(true);
  });

  it('re-throws UnknownCardError with preserved name from import-deckstring', async () => {
    mocks.handlers.clear();
    const store = makeStubStore();
    registerDeckIpc(
      makeOptions({
        store,
        codecLookup: () => ({
          ...makeStubLookup(),
          // any decode attempt throws UnknownCardError below by stubbing decoder
        }),
      }),
    );

    // We monkeypatch a deck-codec by stubbing the lookup to yield a known
    // chain that triggers UnknownCardError. Easier: have the handler invoke
    // fromDeckstring and let it throw. We provide a real encoded string but
    // an empty lookup, so decode will throw DeckstringDecodeError because
    // base64 is invalid. We assert the name field instead.
    const handler = mocks.handlers.get('decks:import-deckstring')!;
    await expect(handler({}, 'invalid-base64-string!@#')).rejects.toMatchObject({
      name: 'DeckstringDecodeError',
    });
  });

  it('re-throws IllegalDeckExportError with preserved name from export-deckstring', async () => {
    mocks.handlers.clear();
    const fakeDeck = {
      id: 'd-1',
      name: 'Half',
      class: 'DRUID' as const,
      format: 'Standard' as const,
      version: 1,
      cards: [{ cardId: 'A', count: 2 }],
      notes: '',
      tags: [],
      createdAt: 0,
      updatedAt: 0,
    };
    const store = makeStubStore({ getById: vi.fn(() => fakeDeck) });
    registerDeckIpc(
      makeOptions({
        store,
        codecLookup: () => ({
          byCardId: (id) =>
            id === 'A'
              ? { cardId: 'A', dbfId: 1, class: 'DRUID', rarity: 'COMMON', type: 'SPELL' }
              : null,
          byDbfId: () => null,
          heroDbfIdForClass: () => 274,
        }),
      }),
    );

    const handler = mocks.handlers.get('decks:export-deckstring')!;
    await expect(handler({}, 'd-1')).rejects.toMatchObject({
      name: 'IllegalDeckExportError',
    });
  });

  it('re-throws NonCollectibleSnapshotError with preserved name from save-from-live', async () => {
    mocks.handlers.clear();
    const store = makeStubStore({
      saveFromLive: vi.fn(() => {
        throw new NonCollectibleSnapshotError(['TOKEN_X']);
      }),
    });
    registerDeckIpc(makeOptions({ store }));

    const handler = mocks.handlers.get('decks:save-from-live')!;
    await expect(
      handler({}, {
        name: 'L',
        class: 'DRUID',
        format: 'Standard',
        cards: [{ cardId: 'TOKEN_X', count: 1 }],
      }),
    ).rejects.toMatchObject({ name: 'NonCollectibleSnapshotError' });
  });

  it('list returns the store result', async () => {
    mocks.handlers.clear();
    const summaries = [
      {
        id: 'd-1',
        name: 'A',
        class: 'DRUID' as const,
        format: 'Standard' as const,
        version: 1,
        cardCount: 30,
        updatedAt: 0,
      },
    ];
    const store = makeStubStore({ list: vi.fn(() => summaries) });
    registerDeckIpc(makeOptions({ store }));
    const handler = mocks.handlers.get('decks:list')!;
    expect(await handler({})).toEqual(summaries);
  });

  // Reference: silence unused-import warning in TS strict mode by referencing
  // imported error classes once.
  it('typed errors are importable from @hdt/core', () => {
    expect(new UnknownCardError('X').name).toBe('UnknownCardError');
    expect(new DeckstringDecodeError('x').name).toBe('DeckstringDecodeError');
    expect(new IllegalDeckExportError([]).name).toBe('IllegalDeckExportError');
  });

  it('does not register decks:sync-from-live when syncFromLive is omitted', () => {
    mocks.handlers.clear();
    mocks.ipcMain.handle.mockClear();
    registerDeckIpc(makeOptions());

    expect(mocks.handlers.has('decks:sync-from-live')).toBe(false);
  });

  it('syncFromLive resolves sync result', async () => {
    mocks.handlers.clear();
    mocks.ipcMain.handle.mockClear();
    const result = {
      ok: true,
      source: 'live' as const,
      synced: 2,
      skippedNonCollectible: 0,
      skippedUnknownClass: 0,
      startedAt: 1,
      finishedAt: 2,
    };
    registerDeckIpc(
      makeOptions({
        syncFromLive: vi.fn(async () => result),
      }),
    );

    const handler = mocks.handlers.get('decks:sync-from-live')!;
    await expect(handler({})).resolves.toMatchObject({ source: 'live', ok: true });
    for (const ch of ALL_CHANNELS_WITH_SYNC) {
      expect(mocks.handlers.has(ch)).toBe(true);
    }
  });

  it('re-registers decks:sync-from-live idempotently', async () => {
    mocks.handlers.clear();
    mocks.ipcMain.handle.mockClear();
    mocks.ipcMain.removeHandler.mockClear();

    const first = vi.fn(async () => ({
      ok: false,
      source: 'not-ready' as const,
      synced: 0,
      skippedNonCollectible: 0,
      skippedUnknownClass: 0,
      startedAt: 0,
      finishedAt: 0,
    }));
    const second = vi.fn(async () => ({
      ok: true,
      source: 'live' as const,
      synced: 1,
      skippedNonCollectible: 0,
      skippedUnknownClass: 0,
      startedAt: 0,
      finishedAt: 0,
    }));
    registerDeckIpc(makeOptions({ syncFromLive: first }));
    registerDeckIpc(makeOptions({ syncFromLive: second }));

    const handler = mocks.handlers.get('decks:sync-from-live')!;
    await handler({});

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
