import { describe, expect, it, vi } from 'vitest';
import { ensureLogConfig, logConfigPath, REQUIRED_LOG_CONFIG } from '..';

describe('logConfigPath', () => {
  it('returns the macOS log.config path from HOME', () => {
    expect(logConfigPath({ HOME: '/Users/me' })).toBe(
      '/Users/me/Library/Preferences/Blizzard/Hearthstone/log.config',
    );
  });

  it('returns the Windows log.config path from LOCALAPPDATA', () => {
    expect(logConfigPath({ LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' })).toBe(
      'C:\\Users\\me\\AppData\\Local\\Blizzard\\Hearthstone\\log.config',
    );
  });
});

describe('ensureLogConfig', () => {
  const configPath = '/tmp/log.config';

  it('creates the canonical Power block when the file is missing', async () => {
    const writeFile = vi.fn(async () => {});
    const mkdir = vi.fn(async () => {});
    const result = await ensureLogConfig({
      configPath,
      readFile: async () => null,
      writeFile,
      mkdir,
    });
    expect(result.changed).toBe(true);
    expect(result.contents).toBe(REQUIRED_LOG_CONFIG);
    expect(writeFile).toHaveBeenCalledWith(configPath, REQUIRED_LOG_CONFIG);
    expect(mkdir).toHaveBeenCalledWith('/tmp');
  });

  it('is idempotent when the Power block is already valid', async () => {
    const writeFile = vi.fn(async () => {});
    const result = await ensureLogConfig({
      configPath,
      readFile: async () => REQUIRED_LOG_CONFIG,
      writeFile,
      mkdir: async () => {},
    });
    expect(result.changed).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('fixes wrong values without discarding other zones', async () => {
    const existing =
      '[Decks]\nLogLevel=1\nFilePrinting=true\n\n[Power]\nLogLevel=1\nFilePrinting=true\nConsolePrinting=true\nScreenPrinting=false\n';
    let written = '';
    const result = await ensureLogConfig({
      configPath,
      readFile: async () => existing,
      writeFile: async (_p, c) => {
        written = c;
      },
      mkdir: async () => {},
    });
    expect(result.changed).toBe(true);
    expect(written).toContain('[Decks]');
    expect(written).toContain('ConsolePrinting=false');
    expect(written).not.toContain('ConsolePrinting=true');
    expect(written).toContain('Verbose=true');
  });
});
