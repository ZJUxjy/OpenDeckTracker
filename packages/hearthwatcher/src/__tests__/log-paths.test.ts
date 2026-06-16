import { describe, expect, it } from 'vitest';
import { discoverPowerLog, REQUIRED_LOG_CONFIG, standardPowerLogPaths } from '..';

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

  it.runIf(process.platform === 'win32')('checks standard Windows paths', () => {
    expect(standardPowerLogPaths({ LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' })).toEqual([
      'C:\\Users\\me\\AppData\\Local\\Blizzard\\Hearthstone\\Logs\\Power.log',
    ]);
  });

  it.runIf(process.platform === 'win32')('finds Power.log under a timestamped directory in a non-standard install', async () => {
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

  it.runIf(process.platform === 'win32')('chooses the newest timestamped Power.log when multiple runs exist', async () => {
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

  it.runIf(process.platform === 'win32')('prefers the newest timestamped Power.log over a stale root log', async () => {
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

  it('checks standard macOS paths', () => {
    expect(standardPowerLogPaths({ HOME: '/Users/me' })).toEqual([
      '/Applications/Hearthstone/Logs/Power.log',
      '/Users/me/Library/Logs/Hearthstone/Power.log',
      '/Users/me/Library/Logs/Blizzard/Hearthstone/Power.log',
    ]);
  });

  it.runIf(process.platform === 'darwin')(
    'finds the newest macOS session Power.log under /Applications/Hearthstone/Logs',
    async () => {
      const sessionLog =
        '/Applications/Hearthstone/Logs/Hearthstone_2026_06_15_11_25_29/Power.log';
      const result = await discoverPowerLog({
        env: { HOME: '/Users/me' },
        detectInstallDir: () => null,
        exists: async (path) => path === sessionLog,
        readDir: async (path) =>
          path === '/Applications/Hearthstone/Logs'
            ? ['Hearthstone_2026_06_15_11_25_29', 'not-a-log-dir']
            : [],
      });
      expect(result.powerLogPath).toBe(sessionLog);
      expect(result.diagnostic).toBeNull();
    },
  );

  it('includes actionable log.config guidance in the macOS missing-log diagnostic', async () => {
    const result = await discoverPowerLog({
      env: { HOME: '/Users/me' },
      detectInstallDir: () => null,
      exists: async () => false,
      readDir: async () => [],
    });
    expect(result.powerLogPath).toBeNull();
    expect(result.diagnostic?.kind).toBe('missing-log');
    expect(result.diagnostic?.expectedLogConfigPath).toBe(
      '/Users/me/Library/Preferences/Blizzard/Hearthstone/log.config',
    );
    expect(result.diagnostic?.requiredLogConfig).toBe(REQUIRED_LOG_CONFIG);
  });
});
