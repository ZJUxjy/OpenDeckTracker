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

  it('exposes read-only live game narration queries and subscription', async () => {
    await import('./index');
    const api = mocks.exposed as {
      gameProgressNarration: {
        getRecent(): Promise<unknown>;
        subscribe(cb: (frame: unknown) => void): () => void;
      };
    };
    const frame = {
      sequence: 0,
      sourceEventIndex: 0,
      eventKind: 'game-started',
      text: '对局开始。',
      facts: {},
    };
    const cb = vi.fn();

    await api.gameProgressNarration.getRecent();
    const unsubscribe = api.gameProgressNarration.subscribe(cb);
    const handler = mocks.ipcRenderer.on.mock.calls.find(
      ([channel]) => channel === 'game-progress-narration:frame',
    )?.[1] as ((event: unknown, frame: unknown) => void) | undefined;
    handler?.({}, frame);
    unsubscribe();

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith('game-progress-narration:get-recent');
    expect(cb).toHaveBeenCalledWith(frame);
    expect(mocks.ipcRenderer.removeListener).toHaveBeenCalledWith(
      'game-progress-narration:frame',
      handler,
    );
  });
});
