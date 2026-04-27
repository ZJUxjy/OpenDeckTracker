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
});
