import { beforeEach, describe, expect, it, vi } from 'vitest';

const handle = vi.fn();
const getVersion = vi.fn(() => '0.1.0');

const hearthMirror = {
  isAlive: vi.fn(),
  getBattleTag: vi.fn(),
  getAccountId: vi.fn(),
  getGameType: vi.fn(),
  isSpectating: vi.fn(),
  isGameOver: vi.fn(),
  isMulligan: vi.fn(),
  dumpClass: vi.fn(),
  listServices: vi.fn(),
  getMatchInfo: vi.fn(),
  getMedalInfo: vi.fn(),
  getDecks: vi.fn(),
  getCollection: vi.fn(),
  getArenaDeck: vi.fn(),
  getBattlegroundRatingInfo: vi.fn(),
  getServerInfo: vi.fn(),
};

vi.mock('electron', () => ({
  app: {
    getVersion,
  },
  ipcMain: {
    handle,
  },
}));

vi.mock('../../main/hearthmirror', () => ({
  getHearthMirror: () => hearthMirror,
}));

describe('registerIpc', () => {
  beforeEach(() => {
    vi.resetModules();
    handle.mockReset();
    getVersion.mockClear();
    Object.values(hearthMirror).forEach((mockFn) => mockFn.mockReset());
  });

  it('registers and delegates hearthmirror debug channels', async () => {
    const { registerIpc } = await import('../../main/ipc');
    registerIpc();

    const handlers = new Map(handle.mock.calls as Array<[string, (...args: any[]) => unknown]>);
    expect(handlers.has('hearthmirror:isMulligan')).toBe(true);
    expect(handlers.has('hearthmirror:dumpClass')).toBe(true);
    expect(handlers.has('hearthmirror:listServices')).toBe(true);

    hearthMirror.isMulligan.mockResolvedValue(true);
    await expect(handlers.get('hearthmirror:isMulligan')?.(undefined)).resolves.toBe(true);
    expect(hearthMirror.isMulligan).toHaveBeenCalledTimes(1);

    const dump = [{ name: 'health', offset: 0x20 }];
    hearthMirror.dumpClass.mockResolvedValue(dump);
    await expect(handlers.get('hearthmirror:dumpClass')?.(undefined, 'CollectionManager')).resolves.toEqual(dump);
    expect(hearthMirror.dumpClass).toHaveBeenCalledWith('CollectionManager');

    const services = [{ name: 'GameMgr', addr: 0x1000 }];
    hearthMirror.listServices.mockResolvedValue(services);
    await expect(handlers.get('hearthmirror:listServices')?.(undefined)).resolves.toEqual(services);
    expect(hearthMirror.listServices).toHaveBeenCalledTimes(1);
  });
});
