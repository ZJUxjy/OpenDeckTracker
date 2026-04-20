import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const exposeInMainWorld = vi.fn();

type DebugFieldDump = { name: string; offset: number };
type DebugServiceEntry = { name: string; addr: number };
type PreloadHearthMirror = {
  isAlive: () => Promise<boolean>;
  getBattleTag: () => Promise<unknown>;
  getAccountId: () => Promise<unknown>;
  getGameType: () => Promise<number>;
  isSpectating: () => Promise<boolean>;
  isGameOver: () => Promise<boolean>;
  isMulligan: () => Promise<boolean>;
  dumpClass: (className: string, limit?: number) => Promise<DebugFieldDump[]>;
  listServices: () => Promise<DebugServiceEntry[]>;
  getMatchInfo: () => Promise<unknown>;
  getMedalInfo: () => Promise<unknown>;
  getDecks: () => Promise<unknown>;
  getCollection: () => Promise<unknown>;
  getArenaDeck: () => Promise<unknown>;
  getBattlegroundRatingInfo: () => Promise<unknown>;
  getServerInfo: () => Promise<unknown>;
};
type PreloadApi = { hearthmirror: PreloadHearthMirror };

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld,
  },
  ipcRenderer: {
    invoke,
  },
}));

const HEARTHMIRROR_NO_ARG_CHANNELS: ReadonlyArray<{
  method: keyof PreloadHearthMirror;
  channel: string;
}> = [
  { method: 'isAlive', channel: 'hearthmirror:isAlive' },
  { method: 'getBattleTag', channel: 'hearthmirror:getBattleTag' },
  { method: 'getAccountId', channel: 'hearthmirror:getAccountId' },
  { method: 'getGameType', channel: 'hearthmirror:getGameType' },
  { method: 'isSpectating', channel: 'hearthmirror:isSpectating' },
  { method: 'isGameOver', channel: 'hearthmirror:isGameOver' },
  { method: 'isMulligan', channel: 'hearthmirror:isMulligan' },
  { method: 'listServices', channel: 'hearthmirror:listServices' },
  { method: 'getMatchInfo', channel: 'hearthmirror:getMatchInfo' },
  { method: 'getMedalInfo', channel: 'hearthmirror:getMedalInfo' },
  { method: 'getDecks', channel: 'hearthmirror:getDecks' },
  { method: 'getCollection', channel: 'hearthmirror:getCollection' },
  { method: 'getArenaDeck', channel: 'hearthmirror:getArenaDeck' },
  { method: 'getBattlegroundRatingInfo', channel: 'hearthmirror:getBattlegroundRatingInfo' },
  { method: 'getServerInfo', channel: 'hearthmirror:getServerInfo' },
];

describe('preload hearthmirror bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    invoke.mockReset();
    exposeInMainWorld.mockReset();
  });

  async function loadApi(): Promise<PreloadApi> {
    await import('../../preload/index');
    expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
    const [, api] = exposeInMainWorld.mock.calls[0] as [string, PreloadApi];
    return api;
  }

  it('exposes every hearthmirror channel through ipcRenderer.invoke', async () => {
    const api = await loadApi();

    for (const { method, channel } of HEARTHMIRROR_NO_ARG_CHANNELS) {
      invoke.mockResolvedValueOnce(null);
      const fn = api.hearthmirror[method] as () => Promise<unknown>;
      await fn();
      expect(invoke).toHaveBeenLastCalledWith(channel);
    }
  });

  it('forwards dumpClass arguments including the optional limit', async () => {
    const api = await loadApi();

    const dump = [{ name: 'health', offset: 0x20 }];
    invoke.mockResolvedValueOnce(dump);
    await expect(api.hearthmirror.dumpClass('CollectionManager')).resolves.toEqual(dump);
    expect(invoke).toHaveBeenLastCalledWith('hearthmirror:dumpClass', 'CollectionManager', undefined);

    invoke.mockResolvedValueOnce(dump);
    await expect(api.hearthmirror.dumpClass('GameMgr', 16)).resolves.toEqual(dump);
    expect(invoke).toHaveBeenLastCalledWith('hearthmirror:dumpClass', 'GameMgr', 16);
  });
});
