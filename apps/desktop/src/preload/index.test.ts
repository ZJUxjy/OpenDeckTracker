import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exposed: null as unknown,
  contextBridge: {
    exposeInMainWorld: vi.fn((_key: string, value: unknown) => {
      mocks.exposed = value;
    }),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  contextBridge: mocks.contextBridge,
  ipcRenderer: mocks.ipcRenderer,
}));

describe('preload api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exposed = null;
    vi.resetModules();
  });

  it('exposes stats summary and recent match queries', async () => {
    await import('./index');
    const api = mocks.exposed as {
      stats: {
        getSummary(filter: string): Promise<unknown>;
        listRecent(filter: string, limit: number): Promise<unknown>;
      };
    };

    await api.stats.getSummary('season');
    await api.stats.listRecent('season', 5);

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(
      'stats:get-summary',
      'season',
      undefined,
    );
    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(
      'stats:list-recent',
      'season',
      5,
      undefined,
    );
  });

  it('exposes read-only match recording queries', async () => {
    await import('./index');
    const api = mocks.exposed as {
      recordings: {
        list(): Promise<unknown>;
        get(recordingId: string): Promise<unknown>;
      };
    };

    await api.recordings.list();
    await api.recordings.get('rec-a');

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith('recordings:list');
    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith('recordings:get', 'rec-a');
  });
});
