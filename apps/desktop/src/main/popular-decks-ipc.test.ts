import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain = {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
    invoke: (channel: string, ...args: unknown[]) =>
      handlers.get(channel)?.({}, ...args),
  };
  return { ipcMain };
});

import * as electron from 'electron';
import { POPULAR_DECKS_SEED, type PopularDeck } from '@hdt/core';
import {
  registerPopularDecksIpc,
  type PopularDecksDataSource,
  type PopularDecksListResult,
} from './popular-decks-ipc';

const SYNCED_DECK: PopularDeck = {
  id: 'tempo-rogue-1',
  name: 'Tempo Rogue',
  class: 'ROGUE',
  format: 'Standard',
  archetype: 'Tempo',
  deckstring: 'AAEC...',
  winratePercent: 50.2,
  gamesCount: 100,
  author: 'hsguru',
  updatedAt: '2026-05-09',
};

function setup(source: PopularDecksDataSource) {
  registerPopularDecksIpc(source);
}

function invoke(): Promise<PopularDecksListResult> {
  const ipcMain = electron.ipcMain as unknown as {
    invoke: (channel: string) => Promise<PopularDecksListResult>;
  };
  return ipcMain.invoke('popular-decks:list');
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  electron.ipcMain.removeHandler('popular-decks:list');
});

describe('popular-decks:list IPC', () => {
  it('returns source=synced and the snapshot fetchedAt when cache valid', async () => {
    setup({
      getSyncedDecks: () => ({ decks: [SYNCED_DECK], fetchedAt: '2026-05-09T12:00:00Z' }),
      getCardDb: () => null,
    });
    const result = await invoke();
    expect(result.source).toBe('synced');
    expect(result.fetchedAt).toBe('2026-05-09T12:00:00Z');
    expect(result.decks).toHaveLength(1);
    expect(result.decks[0]!.id).toBe('tempo-rogue-1');
  });

  it('falls back to seed with fetchedAt=null when cache absent', async () => {
    setup({
      getSyncedDecks: () => null,
      getCardDb: () => null,
    });
    const result = await invoke();
    expect(result.source).toBe('seed');
    expect(result.fetchedAt).toBeNull();
    expect(result.decks).toHaveLength(POPULAR_DECKS_SEED.length);
    expect(result.decks[0]!.id).toBe(POPULAR_DECKS_SEED[0]!.id);
  });

  it('returns empty mana curve / no keyCards when CardDb not ready', async () => {
    setup({
      getSyncedDecks: () => null,
      getCardDb: () => null,
    });
    const result = await invoke();
    expect(result.decks[0]!.manaCurve).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(result.decks[0]!.keyCards).toEqual([]);
    expect(result.decks[0]!.cardNames).toEqual([]);
    expect(result.decks[0]!.dustCost).toBe(0);
  });

  it('reflects updated cache on subsequent calls (no in-process caching hides updates)', async () => {
    let synced: { decks: readonly PopularDeck[]; fetchedAt: string } | null = null;
    setup({
      getSyncedDecks: () => synced,
      getCardDb: () => null,
    });
    const first = await invoke();
    expect(first.source).toBe('seed');

    synced = { decks: [SYNCED_DECK], fetchedAt: '2026-05-09T13:00:00Z' };
    const second = await invoke();
    expect(second.source).toBe('synced');
    expect(second.fetchedAt).toBe('2026-05-09T13:00:00Z');
  });

  it('does not mutate the seed across calls', async () => {
    setup({
      getSyncedDecks: () => null,
      getCardDb: () => null,
    });
    await invoke();
    await invoke();
    // The exported SEED should still contain its own ids
    expect(POPULAR_DECKS_SEED[0]!.id).toBe('harold-rogue-39285857');
  });
});
