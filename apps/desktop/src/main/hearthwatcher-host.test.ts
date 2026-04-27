import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HearthWatcherDiagnostic } from '@hdt/hearthwatcher';

const mocks = vi.hoisted(() => {
  const statusHandlers: ((status: HearthWatcherDiagnostic) => void)[] = [];
  const eventHandlers: ((event: unknown) => void)[] = [];
  const watcher = {
    onStatus: vi.fn((handler: (status: HearthWatcherDiagnostic) => void) => {
      statusHandlers.push(handler);
      return () => undefined;
    }),
    onEvent: vi.fn((handler: (event: unknown) => void) => {
      eventHandlers.push(handler);
      return () => undefined;
    }),
    start: vi.fn(async () => undefined),
    stop: vi.fn(),
  };
  return {
    statusHandlers,
    eventHandlers,
    watcher,
    createHearthWatcher: vi.fn(() => watcher),
    ipcMain: { handle: vi.fn() },
    app: { on: vi.fn() },
    send: vi.fn(),
  };
});

vi.mock('@hdt/hearthwatcher', () => ({
  createHearthWatcher: mocks.createHearthWatcher,
}));

vi.mock('electron', () => ({
  app: mocks.app,
  ipcMain: mocks.ipcMain,
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: { send: mocks.send },
      },
    ],
  },
}));

describe('hearthwatcher-host', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.statusHandlers.length = 0;
    mocks.eventHandlers.length = 0;
    vi.resetModules();
  });

  it('starts HearthWatcher and broadcasts status updates', async () => {
    const { startHearthWatcher } = await import('./hearthwatcher-host');
    startHearthWatcher();

    expect(mocks.createHearthWatcher).toHaveBeenCalledTimes(1);
    expect(mocks.watcher.start).toHaveBeenCalledTimes(1);

    const status: HearthWatcherDiagnostic = {
      kind: 'ready',
      message: 'ready',
      timestamp: 1,
    };
    mocks.statusHandlers[0]?.(status);
    expect(mocks.send).toHaveBeenCalledWith('hearthwatcher:status', status);
  });

  it('registers IPC handler for latest status', async () => {
    const { registerHearthWatcherIpc } = await import('./hearthwatcher-host');
    registerHearthWatcherIpc();

    expect(mocks.ipcMain.handle).toHaveBeenCalledWith(
      'hearthwatcher:get-status',
      expect.any(Function),
    );
  });
});
