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
    invoke: (channel: string, ...args: unknown[]) => {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`No handler for ${channel}`);
      return fn({}, ...args);
    },
  };
  const BrowserWindow = {
    getAllWindows: () => [] as unknown[],
  };
  return { ipcMain, BrowserWindow };
});

import * as electron from 'electron';
import {
  registerPopularDecksSyncIpc,
  SYNC_PROGRESS_CHANNEL,
  SYNC_START_CHANNEL,
  SYNC_STATUS_CHANNEL,
} from './ipc';
import type {
  PopularDeckSyncOrchestrator,
  StartSyncResult,
  SyncProgress,
  SyncStatus,
} from './index';

interface MockOrchestrator extends Pick<PopularDeckSyncOrchestrator, 'startSync' | 'getStatus'> {
  _statusValue: SyncStatus;
}

function makeMockOrchestrator(
  startResult: StartSyncResult,
  statusValue: SyncStatus = { inFlight: false, lastFetchedAt: null },
): MockOrchestrator {
  return {
    _statusValue: statusValue,
    startSync: vi.fn(async (cb: (p: SyncProgress) => void) => {
      cb({ phase: 'meta', completed: 1, total: 1 });
      cb({ phase: 'persist', completed: 1, total: 1 });
      return startResult;
    }) as MockOrchestrator['startSync'],
    getStatus: vi.fn(() => statusValue),
  };
}

describe('registerPopularDecksSyncIpc', () => {
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
  });

  it('registers handlers for the documented channels', () => {
    const orch = makeMockOrchestrator({ ok: true, fetchedAt: 'X', count: 0 });
    dispose = registerPopularDecksSyncIpc(orch as unknown as PopularDeckSyncOrchestrator);
    const handleSpy = vi.mocked(electron.ipcMain.handle);
    const channels = handleSpy.mock.calls.map((c) => c[0] as string);
    expect(channels).toContain(SYNC_START_CHANNEL);
    expect(channels).toContain(SYNC_STATUS_CHANNEL);
  });

  it('invoking sync-start delegates to orchestrator.startSync', async () => {
    const orch = makeMockOrchestrator({ ok: true, fetchedAt: 'T', count: 3 });
    dispose = registerPopularDecksSyncIpc(orch as unknown as PopularDeckSyncOrchestrator);
    const ipcMain = electron.ipcMain as unknown as {
      invoke: (channel: string) => Promise<unknown>;
    };
    const result = await ipcMain.invoke(SYNC_START_CHANNEL);
    expect(result).toEqual({ ok: true, fetchedAt: 'T', count: 3 });
    expect(orch.startSync).toHaveBeenCalledOnce();
  });

  it('invoking sync-status delegates to orchestrator.getStatus', async () => {
    const orch = makeMockOrchestrator(
      { ok: true, fetchedAt: 'X', count: 0 },
      { inFlight: false, lastFetchedAt: '2026-05-09T00:00:00Z' },
    );
    dispose = registerPopularDecksSyncIpc(orch as unknown as PopularDeckSyncOrchestrator);
    const ipcMain = electron.ipcMain as unknown as {
      invoke: (channel: string) => Promise<unknown>;
    };
    const result = await ipcMain.invoke(SYNC_STATUS_CHANNEL);
    expect(result).toEqual({ inFlight: false, lastFetchedAt: '2026-05-09T00:00:00Z' });
  });

  it('dispose() removes the handlers', () => {
    const orch = makeMockOrchestrator({ ok: true, fetchedAt: 'X', count: 0 });
    const local = registerPopularDecksSyncIpc(orch as unknown as PopularDeckSyncOrchestrator);
    local();
    const removeSpy = vi.mocked(electron.ipcMain.removeHandler);
    const channels = removeSpy.mock.calls.map((c) => c[0]);
    expect(channels).toContain(SYNC_START_CHANNEL);
    expect(channels).toContain(SYNC_STATUS_CHANNEL);
  });
});

describe('progress channel constant', () => {
  it('matches the documented channel name', () => {
    expect(SYNC_PROGRESS_CHANNEL).toBe('popular-decks:sync-progress');
  });
});
