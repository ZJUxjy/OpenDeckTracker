import { beforeEach, describe, expect, it, vi } from 'vitest';

const handle = vi.fn();
const getVersion = vi.fn(() => '0.1.0');
type IpcHandler = (...args: unknown[]) => unknown;

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

const ALL_HEARTHMIRROR_CHANNELS = [
  'hearthmirror:isAlive',
  'hearthmirror:getBattleTag',
  'hearthmirror:getAccountId',
  'hearthmirror:getGameType',
  'hearthmirror:isSpectating',
  'hearthmirror:isGameOver',
  'hearthmirror:isMulligan',
  'hearthmirror:dumpClass',
  'hearthmirror:listServices',
  'hearthmirror:getMatchInfo',
  'hearthmirror:getMedalInfo',
  'hearthmirror:getDecks',
  'hearthmirror:getCollection',
  'hearthmirror:getArenaDeck',
  'hearthmirror:getBattlegroundRatingInfo',
  'hearthmirror:getServerInfo',
] as const;

async function loadHandlers(): Promise<Map<string, IpcHandler>> {
  const { registerIpc } = await import('../../main/ipc');
  registerIpc();
  return new Map<string, IpcHandler>(handle.mock.calls as Array<[string, IpcHandler]>);
}

describe('registerIpc', () => {
  beforeEach(() => {
    vi.resetModules();
    handle.mockReset();
    getVersion.mockClear();
    Object.values(hearthMirror).forEach((mockFn) => mockFn.mockReset());
  });

  it('registers every hearthmirror channel exposed in preload', async () => {
    const handlers = await loadHandlers();
    for (const channel of ALL_HEARTHMIRROR_CHANNELS) {
      expect(handlers.has(channel), `missing handler for ${channel}`).toBe(true);
    }
  });

  it('delegates debug channels and forwards arguments', async () => {
    const handlers = await loadHandlers();

    hearthMirror.isMulligan.mockResolvedValue(true);
    await expect(handlers.get('hearthmirror:isMulligan')?.(undefined)).resolves.toBe(true);
    expect(hearthMirror.isMulligan).toHaveBeenCalledTimes(1);

    const dump = [{ name: 'health', offset: 0x20 }];
    hearthMirror.dumpClass.mockResolvedValue(dump);
    await expect(
      handlers.get('hearthmirror:dumpClass')?.(undefined, 'CollectionManager'),
    ).resolves.toEqual(dump);
    expect(hearthMirror.dumpClass).toHaveBeenCalledWith('CollectionManager', undefined);

    hearthMirror.dumpClass.mockResolvedValue(dump);
    await expect(
      handlers.get('hearthmirror:dumpClass')?.(undefined, 'GameMgr', 32),
    ).resolves.toEqual(dump);
    expect(hearthMirror.dumpClass).toHaveBeenLastCalledWith('GameMgr', 32);

    const services = [{ name: 'GameMgr', addr: 0x1000 }];
    hearthMirror.listServices.mockResolvedValue(services);
    await expect(handlers.get('hearthmirror:listServices')?.(undefined)).resolves.toEqual(services);
  });

  it('returns sane fallbacks when native methods reject', async () => {
    const handlers = await loadHandlers();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const cases: Array<{ channel: string; mock: ReturnType<typeof vi.fn>; fallback: unknown }> = [
      { channel: 'hearthmirror:isAlive', mock: hearthMirror.isAlive, fallback: false },
      { channel: 'hearthmirror:isSpectating', mock: hearthMirror.isSpectating, fallback: false },
      { channel: 'hearthmirror:isGameOver', mock: hearthMirror.isGameOver, fallback: false },
      { channel: 'hearthmirror:isMulligan', mock: hearthMirror.isMulligan, fallback: false },
      { channel: 'hearthmirror:getGameType', mock: hearthMirror.getGameType, fallback: 0 },
      { channel: 'hearthmirror:listServices', mock: hearthMirror.listServices, fallback: [] },
      { channel: 'hearthmirror:getBattleTag', mock: hearthMirror.getBattleTag, fallback: null },
      { channel: 'hearthmirror:getAccountId', mock: hearthMirror.getAccountId, fallback: null },
      { channel: 'hearthmirror:getMatchInfo', mock: hearthMirror.getMatchInfo, fallback: null },
      { channel: 'hearthmirror:getMedalInfo', mock: hearthMirror.getMedalInfo, fallback: null },
      { channel: 'hearthmirror:getDecks', mock: hearthMirror.getDecks, fallback: null },
      { channel: 'hearthmirror:getCollection', mock: hearthMirror.getCollection, fallback: null },
      { channel: 'hearthmirror:getArenaDeck', mock: hearthMirror.getArenaDeck, fallback: null },
      {
        channel: 'hearthmirror:getBattlegroundRatingInfo',
        mock: hearthMirror.getBattlegroundRatingInfo,
        fallback: null,
      },
      { channel: 'hearthmirror:getServerInfo', mock: hearthMirror.getServerInfo, fallback: null },
    ];

    for (const { channel, mock, fallback } of cases) {
      mock.mockRejectedValueOnce(new Error('native boom'));
      await expect(handlers.get(channel)?.(undefined)).resolves.toEqual(fallback);
    }
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
