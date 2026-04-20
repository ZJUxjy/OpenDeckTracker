import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const exposeInMainWorld = vi.fn();

type DebugFieldDump = { name: string; offset: number };
type DebugServiceEntry = { name: string; addr: number };
type PreloadApi = {
  hearthmirror: {
    isMulligan: () => Promise<boolean>;
    dumpClass: (className: string) => Promise<DebugFieldDump[]>;
    listServices: () => Promise<DebugServiceEntry[]>;
  };
};

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld,
  },
  ipcRenderer: {
    invoke,
  },
}));

describe('preload hearthmirror bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    invoke.mockReset();
    exposeInMainWorld.mockReset();
  });

  it('exposes debug hearthmirror methods through ipc', async () => {
    await import('../../preload/index');

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
    const [, api] = exposeInMainWorld.mock.calls[0] as [string, PreloadApi];

    invoke.mockResolvedValueOnce(false);
    await expect(api.hearthmirror.isMulligan()).resolves.toBe(false);
    expect(invoke).toHaveBeenNthCalledWith(1, 'hearthmirror:isMulligan');

    const dump = [{ name: 'health', offset: 0x20 }];
    invoke.mockResolvedValueOnce(dump);
    await expect(api.hearthmirror.dumpClass('CollectionManager')).resolves.toEqual(dump);
    expect(invoke).toHaveBeenNthCalledWith(2, 'hearthmirror:dumpClass', 'CollectionManager');

    const services = [{ name: 'GameMgr', addr: 0x1000 }];
    invoke.mockResolvedValueOnce(services);
    await expect(api.hearthmirror.listServices()).resolves.toEqual(services);
    expect(invoke).toHaveBeenNthCalledWith(3, 'hearthmirror:listServices');
  });
});
