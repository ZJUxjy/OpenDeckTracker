import { describe, expect, it } from 'vitest';
import { discoverPowerLog, standardPowerLogPaths } from '..';

describe('discoverPowerLog', () => {
  it('uses explicit override when it exists', async () => {
    const result = await discoverPowerLog({
      overridePath: 'C:\\Logs\\Power.log',
      exists: async (path) => path === 'C:\\Logs\\Power.log',
    });
    expect(result.powerLogPath).toBe('C:\\Logs\\Power.log');
    expect(result.diagnostic).toBeNull();
  });

  it('returns missing-log diagnostic for missing override', async () => {
    const result = await discoverPowerLog({
      overridePath: 'C:\\Logs\\Power.log',
      exists: async () => false,
    });
    expect(result.powerLogPath).toBeNull();
    expect(result.diagnostic?.kind).toBe('missing-log');
  });

  it('checks standard Windows paths', () => {
    expect(standardPowerLogPaths({ LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' })).toEqual([
      'C:\\Users\\me\\AppData\\Local\\Blizzard\\Hearthstone\\Logs\\Power.log',
    ]);
  });

  it('finds Power.log under a timestamped directory in a non-standard install', async () => {
    const installDir = 'E:\\battle\\Hearthstone';
    const powerLog = `${installDir}\\Logs\\Hearthstone_2026_04_27_15_34_09\\Power.log`;
    const result = await discoverPowerLog({
      env: {},
      installDirs: [installDir],
      exists: async (path) => path === powerLog,
      readDir: async (path) =>
        path === `${installDir}\\Logs`
          ? ['Hearthstone_2026_04_27_15_34_09', 'not-a-log-dir']
          : [],
    });

    expect(result.powerLogPath).toBe(powerLog);
    expect(result.diagnostic).toBeNull();
    expect(result.searchedPaths).toContain(powerLog);
  });

  it('chooses the newest timestamped Power.log when multiple runs exist', async () => {
    const installDir = 'E:\\battle\\Hearthstone';
    const newest = `${installDir}\\Logs\\Hearthstone_2026_04_27_15_34_09\\Power.log`;
    const older = `${installDir}\\Logs\\Hearthstone_2026_04_27_14_00_00\\Power.log`;
    const result = await discoverPowerLog({
      env: {},
      installDirs: [installDir],
      exists: async (path) => path === newest || path === older,
      readDir: async () => [
        'Hearthstone_2026_04_27_14_00_00',
        'Hearthstone_2026_04_27_15_34_09',
      ],
    });

    expect(result.powerLogPath).toBe(newest);
  });

  it('prefers the newest timestamped Power.log over a stale root log', async () => {
    const installDir = 'E:\\battle\\Hearthstone';
    const root = `${installDir}\\Logs\\Power.log`;
    const newest = `${installDir}\\Logs\\Hearthstone_2026_04_27_15_34_09\\Power.log`;
    const result = await discoverPowerLog({
      env: {},
      installDirs: [installDir],
      exists: async (path) => path === root || path === newest,
      readDir: async () => ['Hearthstone_2026_04_27_15_34_09'],
    });

    expect(result.powerLogPath).toBe(newest);
  });
});
