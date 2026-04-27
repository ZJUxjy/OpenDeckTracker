import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeCompletedMatch, type MatchHistoryRecord } from '@hdt/core';
import type { MatchHistoryStore } from './match-history-store';

const mocks = vi.hoisted(() => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn(() => 'D:\\user-data') },
}));

vi.mock('electron', () => ({
  app: mocks.app,
  ipcMain: mocks.ipcMain,
}));

const makeRecord = (overrides: Partial<MatchHistoryRecord> = {}): MatchHistoryRecord => ({
  id: 1,
  ...normalizeCompletedMatch({
    fingerprint: 'a',
    startedAt: Date.parse('2026-04-27T10:00:00Z'),
    endedAt: Date.parse('2026-04-27T10:10:00Z'),
    result: 'win',
    playOrder: 'first',
    deckId: 42,
    deckName: 'Recorded Real Deck',
    opponentName: 'Opponent',
    opponentClass: 'Mage',
    gameType: 3,
    formatType: 2,
    source: 'deck-tracker',
  }),
  ...overrides,
});

function makeStoreWithMatches(matches: MatchHistoryRecord[]): MatchHistoryStore {
  return {
    record: vi.fn(),
    listRecent: vi.fn(({ limit }) => matches.slice(0, limit ?? 5)),
    getAllForFilter: vi.fn(() => matches),
    close: vi.fn(),
  };
}

describe('stats-host', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers stats IPC handlers', async () => {
    const { registerStatsIpc } = await import('./stats-host');

    registerStatsIpc(makeStoreWithMatches([makeRecord()]));

    expect(mocks.ipcMain.handle).toHaveBeenCalledWith('stats:get-summary', expect.any(Function));
    expect(mocks.ipcMain.handle).toHaveBeenCalledWith('stats:list-recent', expect.any(Function));
  });

  it('returns aggregate stats through the summary handler', async () => {
    const { registerStatsIpc } = await import('./stats-host');
    const store = makeStoreWithMatches([makeRecord()]);
    registerStatsIpc(store);

    const handler = mocks.ipcMain.handle.mock.calls.find(([channel]) => channel === 'stats:get-summary')?.[1];
    const summary = await handler({}, 'all-time');

    expect(summary).toMatchObject({
      matchesPlayed: 1,
      wins: 1,
      overallWinrate: 100,
    });
  });

  it('returns recent matches through the list handler', async () => {
    const { registerStatsIpc } = await import('./stats-host');
    const store = makeStoreWithMatches([makeRecord({ id: 1 }), makeRecord({ id: 2, fingerprint: 'b' })]);
    registerStatsIpc(store);

    const handler = mocks.ipcMain.handle.mock.calls.find(([channel]) => channel === 'stats:list-recent')?.[1];
    const recent = await handler({}, 'all-time', 1);

    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({ id: 1 });
  });
});
