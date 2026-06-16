import { describe, expect, it, vi } from 'vitest';
import {
  CLIENT_CONFIG_CONTENTS,
  ensureClientConfig,
  ensureLogConfig,
  logConfigPath,
  REQUIRED_LOG_CONFIG,
} from '..';

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

  it('collapses duplicate keys so it converges on the second run', async () => {
    let stored =
      '[Power]\nLogLevel=1\nFilePrinting=true\nConsolePrinting=false\nScreenPrinting=false\nVerbose=true\nVerbose=false\n';
    const opts = {
      configPath,
      readFile: async () => stored,
      writeFile: async (_p: string, c: string) => {
        stored = c;
      },
      mkdir: async () => {},
    };
    const first = await ensureLogConfig(opts);
    expect(first.changed).toBe(true);
    const second = await ensureLogConfig(opts);
    expect(second.changed).toBe(false);
    expect(stored.match(/Verbose=/g)?.length).toBe(1);
    expect(stored).toContain('Verbose=true');
    expect(stored).not.toContain('Verbose=false');
  });

  it('treats a CRLF Power block as valid and does not rewrite it', async () => {
    const crlf = REQUIRED_LOG_CONFIG.replace(/\n/g, '\r\n');
    const writeFile = vi.fn(async () => {});
    const result = await ensureLogConfig({
      configPath,
      readFile: async () => crlf,
      writeFile,
      mkdir: async () => {},
    });
    expect(result.changed).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('appends a Power section when the file has only other zones', async () => {
    let written = '';
    const result = await ensureLogConfig({
      configPath,
      readFile: async () => '[Decks]\nLogLevel=1\n',
      writeFile: async (_p, c) => {
        written = c;
      },
      mkdir: async () => {},
    });
    expect(result.changed).toBe(true);
    expect(written).toContain('[Decks]');
    expect(written).toContain('[Power]');
    expect(written).toContain('Verbose=true');
  });
});

describe('ensureClientConfig', () => {
  it('writes client.config to the default install dir when missing', async () => {
    const writeFile = vi.fn(async () => {});
    const result = await ensureClientConfig({
      readFile: async () => null,
      writeFile,
    });
    expect(result.path).toBe('/Applications/Hearthstone/client.config');
    expect(result.changed).toBe(true);
    expect(result.written).toBe(true);
    expect(writeFile).toHaveBeenCalledWith(
      '/Applications/Hearthstone/client.config',
      CLIENT_CONFIG_CONTENTS,
    );
  });

  it('is idempotent when the contents already match', async () => {
    const writeFile = vi.fn(async () => {});
    const result = await ensureClientConfig({
      readFile: async () => CLIENT_CONFIG_CONTENTS,
      writeFile,
    });
    expect(result.changed).toBe(false);
    expect(result.written).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('returns an error instead of throwing when the write is not permitted', async () => {
    const result = await ensureClientConfig({
      readFile: async () => null,
      writeFile: async () => {
        throw new Error('EACCES: permission denied');
      },
    });
    expect(result.written).toBe(false);
    expect(result.changed).toBe(false);
    expect(result.error).toContain('EACCES');
  });

  it('honors a custom install dir', async () => {
    const writeFile = vi.fn(async () => {});
    const result = await ensureClientConfig({
      installDir: '/Volumes/Games/Hearthstone',
      readFile: async () => null,
      writeFile,
    });
    expect(result.path).toBe('/Volumes/Games/Hearthstone/client.config');
  });
});
