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

  it('exposes card image bulk download channels', async () => {
    mocks.ipcRenderer.invoke.mockResolvedValue({ ok: true, status: { state: 'running' } });
    await import('./index');
    const api = mocks.exposed as {
      cardImages: {
        bulkDownload: {
          start: (types: string[], force?: boolean) => Promise<unknown>;
        };
      };
    };
    const result = await api.cardImages.bulkDownload.start(['render'], true);
    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(
      'card-image-bulk-download:start',
      ['render'],
      true,
    );
    expect(result).toEqual({ ok: true, status: { state: 'running' } });
  });

  it('exposes advisor ask, config, and subscription channels', async () => {
    await import('./index');
    const api = mocks.exposed as {
      advisor: {
        ask(question: string): Promise<unknown>;
        getConfig(): Promise<unknown>;
        setConfig(config: unknown): Promise<unknown>;
        onState(cb: (state: unknown) => void): () => void;
        onAskChunk(cb: (chunk: string) => void): () => void;
      };
    };
    const config = { enabled: true, autoSuggest: true };
    const state = { status: 'ready' };
    const stateCb = vi.fn();
    const chunkCb = vi.fn();

    await api.advisor.ask('why trade?');
    await api.advisor.getConfig();
    await api.advisor.setConfig(config);
    const offState = api.advisor.onState(stateCb);
    const offChunk = api.advisor.onAskChunk(chunkCb);
    const stateHandler = mocks.ipcRenderer.on.mock.calls.find(
      ([channel]) => channel === 'advisor:state',
    )?.[1] as ((event: unknown, state: unknown) => void) | undefined;
    const chunkHandler = mocks.ipcRenderer.on.mock.calls.find(
      ([channel]) => channel === 'advisor:ask:chunk',
    )?.[1] as ((event: unknown, chunk: string) => void) | undefined;
    stateHandler?.({}, state);
    chunkHandler?.({}, 'chunk');
    offState();
    offChunk();

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith('advisor:ask', 'why trade?');
    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith('advisor:config:get');
    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith('advisor:config:set', config);
    expect(stateCb).toHaveBeenCalledWith(state);
    expect(chunkCb).toHaveBeenCalledWith('chunk');
    expect(mocks.ipcRenderer.removeListener).toHaveBeenCalledWith('advisor:state', stateHandler);
    expect(mocks.ipcRenderer.removeListener).toHaveBeenCalledWith(
      'advisor:ask:chunk',
      chunkHandler,
    );
  });
});
