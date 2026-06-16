# macOS Log Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@hdt/hearthwatcher` discover Hearthstone's `Power.log` on macOS and provide opt-in, never-auto-invoked utilities to write `log.config`/`client.config`, plus an actionable missing-log diagnostic.

**Architecture:** All changes live in the `@hdt/hearthwatcher` package as pure, dependency-injected functions (matching the existing `log-paths.ts` style). macOS path candidates are constructed with `node:path` `posix.join` so they are deterministic on any runner OS (the package's CI runs on Windows). The config writers are pure utilities the future guided flow will call; nothing here runs on startup, honoring the project's "do not silently write log.config" decision.

**Tech Stack:** TypeScript (ESM), Node.js `node:path` / `node:fs/promises`, vitest, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-06-16-macos-log-support-design.md`

---

## File Structure

- **Modify** `packages/hearthwatcher/src/log-paths.ts` — add macOS candidates to `standardPowerLogPaths`; make `missingDiagnostic` platform-aware.
- **Create** `packages/hearthwatcher/src/log-config.ts` — `logConfigPath`, `ensureLogConfig`, `ensureClientConfig`, and shared constants.
- **Modify** `packages/hearthwatcher/src/types/diagnostics.ts` — add two optional fields to `HearthWatcherDiagnostic`.
- **Modify** `packages/hearthwatcher/src/index.ts` — export the new public surface.
- **Modify** `packages/hearthwatcher/src/__tests__/log-paths.test.ts` — add macOS tests; platform-guard the Windows-literal tests.
- **Create** `packages/hearthwatcher/src/__tests__/log-config.test.ts` — tests for the new module.

### Conventions to follow

- Pure functions with injectable side effects (`exists`, `readDir`, `readFile`, `writeFile`, `mkdir`, `env`) — never call the real filesystem inside tests.
- macOS paths use `posix.join`; Windows paths keep the existing ambient `join`.
- Run a single test file with: `pnpm --filter @hdt/hearthwatcher test <path>` (forwards the path to `vitest run`).
- Typecheck with: `pnpm --filter @hdt/hearthwatcher typecheck`.

---

## Task 1: macOS Power.log discovery + green-on-darwin test suite

**Files:**
- Modify: `packages/hearthwatcher/src/log-paths.ts` (`standardPowerLogPaths`, lines 88-100; import on line 3)
- Test: `packages/hearthwatcher/src/__tests__/log-paths.test.ts`

- [ ] **Step 1: Write the failing macOS discovery tests**

In `packages/hearthwatcher/src/__tests__/log-paths.test.ts`, add these two tests inside the existing `describe('discoverPowerLog', …)` block (after the last test, before the closing `});`):

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @hdt/hearthwatcher test log-paths`
Expected: FAIL — `checks standard macOS paths` returns `[]` (no macOS branch yet), so `toEqual` mismatches.

- [ ] **Step 3: Add the macOS branch to `standardPowerLogPaths`**

In `packages/hearthwatcher/src/log-paths.ts`, change the import on line 3 from:

```ts
import { join } from 'node:path';
```

to:

```ts
import { join, posix } from 'node:path';
```

Then, in `standardPowerLogPaths` (lines 88-100), insert the macOS branch immediately before the final `return` statement (after the `if (env['ProgramFiles(x86)'])` block):

```ts
  if (env.HOME) {
    // macOS. Built with posix.join so the candidates are deterministic
    // regardless of the OS the discovery/tests run on (macOS paths are always
    // POSIX, and this package's CI runs on Windows). Confirmed-first ordering:
    // /Applications/Hearthstone/Logs is the verified location on a real macOS
    // install; the ~/Library variants are unverified fallbacks.
    candidates.push('/Applications/Hearthstone/Logs/Power.log');
    candidates.push(posix.join(env.HOME, 'Library', 'Logs', 'Hearthstone', 'Power.log'));
    candidates.push(
      posix.join(env.HOME, 'Library', 'Logs', 'Blizzard', 'Hearthstone', 'Power.log'),
    );
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @hdt/hearthwatcher test log-paths`
Expected: `checks standard macOS paths` PASSES on every OS; the darwin-only test PASSES on macOS (skipped on Windows). The 4 existing Windows-literal tests still FAIL on darwin — fixed in the next step.

- [ ] **Step 5: Platform-guard the Windows-literal tests so the suite is green on darwin**

In `packages/hearthwatcher/src/__tests__/log-paths.test.ts`, change the test declarations for the four tests that build Windows paths via ambient `join` so they only run on Windows. Change each of these from `it('…', …)` to `it.runIf(process.platform === 'win32')('…', …)`:

- `it('checks standard Windows paths', …)`
- `it('finds Power.log under a timestamped directory in a non-standard install', …)`
- `it('chooses the newest timestamped Power.log when multiple runs exist', …)`
- `it('prefers the newest timestamped Power.log over a stale root log', …)`

For example, the first becomes:

```ts
  it.runIf(process.platform === 'win32')('checks standard Windows paths', () => {
    expect(standardPowerLogPaths({ LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' })).toEqual([
      'C:\\Users\\me\\AppData\\Local\\Blizzard\\Hearthstone\\Logs\\Power.log',
    ]);
  });
```

Leave the two `overridePath` tests unchanged (they use no `join` and pass on every OS).

- [ ] **Step 6: Run the whole log-paths suite to verify green-on-darwin**

Run: `pnpm --filter @hdt/hearthwatcher test log-paths`
Expected: PASS, no failures (the Windows-literal tests report as skipped on macOS).

- [ ] **Step 7: Commit**

```bash
git add packages/hearthwatcher/src/log-paths.ts packages/hearthwatcher/src/__tests__/log-paths.test.ts
git commit -m "feat(hearthwatcher): discover Power.log on macOS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `ensureLogConfig` utility

**Files:**
- Create: `packages/hearthwatcher/src/log-config.ts`
- Modify: `packages/hearthwatcher/src/index.ts`
- Test: `packages/hearthwatcher/src/__tests__/log-config.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/hearthwatcher/src/__tests__/log-config.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @hdt/hearthwatcher test log-config`
Expected: FAIL — `ensureLogConfig`, `logConfigPath`, `REQUIRED_LOG_CONFIG` are not exported.

- [ ] **Step 3: Create the `log-config.ts` module**

Create `packages/hearthwatcher/src/log-config.ts`:

```ts
import { mkdir as fsMkdir, readFile as fsReadFile, writeFile as fsWriteFile } from 'node:fs/promises';
import { posix, win32 } from 'node:path';

/** The canonical `[Power]` stanza Hearthstone needs in order to emit Power.log. */
export const REQUIRED_LOG_CONFIG =
  '[Power]\nLogLevel=1\nFilePrinting=true\nConsolePrinting=false\nScreenPrinting=false\nVerbose=true\n';

const REQUIRED_POWER_KEYS: ReadonlyArray<readonly [string, string]> = [
  ['LogLevel', '1'],
  ['FilePrinting', 'true'],
  ['ConsolePrinting', 'false'],
  ['ScreenPrinting', 'false'],
  ['Verbose', 'true'],
];

export interface LogConfigOptions {
  env?: NodeJS.ProcessEnv;
  configPath?: string;
  readFile?: (path: string) => Promise<string | null>;
  writeFile?: (path: string, contents: string) => Promise<void>;
  mkdir?: (dir: string) => Promise<void>;
}

export interface LogConfigResult {
  path: string;
  changed: boolean;
  contents: string;
}

/** Resolve the Hearthstone log.config path for the given environment. */
export function logConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.HOME) {
    return posix.join(
      env.HOME,
      'Library',
      'Preferences',
      'Blizzard',
      'Hearthstone',
      'log.config',
    );
  }
  if (env.LOCALAPPDATA) {
    return win32.join(env.LOCALAPPDATA, 'Blizzard', 'Hearthstone', 'log.config');
  }
  throw new Error('Cannot determine log.config path: neither HOME nor LOCALAPPDATA is set');
}

async function defaultReadFile(path: string): Promise<string | null> {
  try {
    return await fsReadFile(path, 'utf8');
  } catch {
    return null;
  }
}

const defaultWriteFile = async (path: string, contents: string): Promise<void> => {
  await fsWriteFile(path, contents, 'utf8');
};

const defaultMkdir = async (dir: string): Promise<void> => {
  await fsMkdir(dir, { recursive: true });
};

/**
 * Ensure Hearthstone's log.config enables the `[Power]` zone this package
 * parses. Pure and opt-in: callers (e.g. a user-consented guided flow) decide
 * when to invoke it; it is never auto-run. Preserves any other zones the user
 * already configured, and only writes when a required key is missing or wrong.
 */
export async function ensureLogConfig(options: LogConfigOptions = {}): Promise<LogConfigResult> {
  const env = options.env ?? process.env;
  const path = options.configPath ?? logConfigPath(env);
  const readFile = options.readFile ?? defaultReadFile;
  const writeFile = options.writeFile ?? defaultWriteFile;
  const mkdir = options.mkdir ?? defaultMkdir;

  const existing = await readFile(path);

  if (existing === null || existing.trim() === '') {
    await mkdir(parentDir(path));
    await writeFile(path, REQUIRED_LOG_CONFIG);
    return { path, changed: true, contents: REQUIRED_LOG_CONFIG };
  }

  if (powerSectionIsValid(existing)) {
    return { path, changed: false, contents: existing };
  }

  const merged = mergePowerSection(existing);
  await mkdir(parentDir(path));
  await writeFile(path, merged);
  return { path, changed: true, contents: merged };
}

interface IniSection {
  name: string | null;
  lines: string[];
}

function parseSections(content: string): IniSection[] {
  const sections: IniSection[] = [];
  let current: IniSection = { name: null, lines: [] };
  for (const line of content.split('\n')) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (header) {
      sections.push(current);
      current = { name: header[1]!, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections;
}

function sectionKeyValues(section: IniSection): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of section.lines) {
    const m = /^\s*([^=\s]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) map.set(m[1]!, m[2]!);
  }
  return map;
}

function powerSectionIsValid(content: string): boolean {
  const power = parseSections(content).find((s) => s.name === 'Power');
  if (!power) return false;
  const kv = sectionKeyValues(power);
  return REQUIRED_POWER_KEYS.every(([key, value]) => kv.get(key) === value);
}

function mergePowerSection(content: string): string {
  const sections = parseSections(content);
  let power = sections.find((s) => s.name === 'Power');
  if (!power) {
    power = { name: 'Power', lines: [] };
    sections.push(power);
  }
  for (const [key, value] of REQUIRED_POWER_KEYS) {
    const idx = power.lines.findIndex((line) => {
      const m = /^\s*([^=\s]+)\s*=/.exec(line);
      return m?.[1] === key;
    });
    if (idx >= 0) {
      power.lines[idx] = `${key}=${value}`;
    } else {
      power.lines.push(`${key}=${value}`);
    }
  }
  return serializeSections(sections);
}

function serializeSections(sections: IniSection[]): string {
  const parts: string[] = [];
  for (const section of sections) {
    if (section.name !== null) parts.push(`[${section.name}]`);
    parts.push(...section.lines);
  }
  return parts.join('\n');
}

function parentDir(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx >= 0 ? path.slice(0, idx) : path;
}
```

- [ ] **Step 4: Export the new surface from `index.ts`**

In `packages/hearthwatcher/src/index.ts`, add after the existing `discoverPowerLog` export block (after line 6):

```ts
export { ensureLogConfig, logConfigPath, REQUIRED_LOG_CONFIG } from './log-config';
export type { LogConfigOptions, LogConfigResult } from './log-config';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @hdt/hearthwatcher test log-config`
Expected: PASS — all `logConfigPath` and `ensureLogConfig` tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/hearthwatcher/src/log-config.ts packages/hearthwatcher/src/index.ts packages/hearthwatcher/src/__tests__/log-config.test.ts
git commit -m "feat(hearthwatcher): add opt-in ensureLogConfig utility

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `ensureClientConfig` utility

**Files:**
- Modify: `packages/hearthwatcher/src/log-config.ts`
- Modify: `packages/hearthwatcher/src/index.ts`
- Test: `packages/hearthwatcher/src/__tests__/log-config.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/hearthwatcher/src/__tests__/log-config.test.ts`, update the top import line to also pull in the client-config symbols:

```ts
import {
  CLIENT_CONFIG_CONTENTS,
  ensureClientConfig,
  ensureLogConfig,
  logConfigPath,
  REQUIRED_LOG_CONFIG,
} from '..';
```

Then add a new describe block at the end of the file:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @hdt/hearthwatcher test log-config`
Expected: FAIL — `ensureClientConfig` and `CLIENT_CONFIG_CONTENTS` are not exported.

- [ ] **Step 3: Add `ensureClientConfig` to `log-config.ts`**

In `packages/hearthwatcher/src/log-config.ts`, append:

```ts
/** Exact contents HSTracker writes to disable Hearthstone's log size limit. */
export const CLIENT_CONFIG_CONTENTS = '[Log]\nFileSizeLimit.Int=-1';

export interface ClientConfigOptions {
  installDir?: string;
  readFile?: (path: string) => Promise<string | null>;
  writeFile?: (path: string, contents: string) => Promise<void>;
}

export interface ClientConfigResult {
  path: string;
  changed: boolean;
  written: boolean;
  error?: string;
}

/**
 * Best-effort, opt-in writer for Hearthstone's client.config (disables the log
 * file-size limit). Lives alongside Hearthstone.app, not inside the bundle.
 * Unlike HSTracker it does not swallow write failures silently — a permission
 * error is returned in `error` rather than thrown, so the caller can surface it.
 */
export async function ensureClientConfig(
  options: ClientConfigOptions = {},
): Promise<ClientConfigResult> {
  const installDir = options.installDir ?? '/Applications/Hearthstone';
  const path = posix.join(installDir, 'client.config');
  const readFile = options.readFile ?? defaultReadFile;
  const writeFile = options.writeFile ?? defaultWriteFile;

  const existing = await readFile(path);
  if (existing === CLIENT_CONFIG_CONTENTS) {
    return { path, changed: false, written: false };
  }

  try {
    await writeFile(path, CLIENT_CONFIG_CONTENTS);
    return { path, changed: true, written: true };
  } catch (err) {
    return {
      path,
      changed: false,
      written: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
```

- [ ] **Step 4: Export the new surface from `index.ts`**

In `packages/hearthwatcher/src/index.ts`, replace the two lines added in Task 2 with:

```ts
export {
  CLIENT_CONFIG_CONTENTS,
  ensureClientConfig,
  ensureLogConfig,
  logConfigPath,
  REQUIRED_LOG_CONFIG,
} from './log-config';
export type {
  ClientConfigOptions,
  ClientConfigResult,
  LogConfigOptions,
  LogConfigResult,
} from './log-config';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @hdt/hearthwatcher test log-config`
Expected: PASS — all `ensureClientConfig` tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/hearthwatcher/src/log-config.ts packages/hearthwatcher/src/index.ts packages/hearthwatcher/src/__tests__/log-config.test.ts
git commit -m "feat(hearthwatcher): add best-effort ensureClientConfig utility

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Actionable macOS missing-log diagnostic

**Files:**
- Modify: `packages/hearthwatcher/src/types/diagnostics.ts` (lines 9-18)
- Modify: `packages/hearthwatcher/src/log-paths.ts` (`discoverPowerLog` lines 22-86; `missingDiagnostic` lines 210-217)
- Test: `packages/hearthwatcher/src/__tests__/log-paths.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/hearthwatcher/src/__tests__/log-paths.test.ts`, update the top import to also import `REQUIRED_LOG_CONFIG`:

```ts
import { discoverPowerLog, REQUIRED_LOG_CONFIG, standardPowerLogPaths } from '..';
```

Add this test inside the `describe('discoverPowerLog', …)` block:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @hdt/hearthwatcher test log-paths`
Expected: FAIL — `expectedLogConfigPath` is `undefined` (field and logic do not exist yet).

- [ ] **Step 3: Add the optional fields to the diagnostic type**

In `packages/hearthwatcher/src/types/diagnostics.ts`, add two fields to `HearthWatcherDiagnostic` (before the closing `}` at line 18):

```ts
  expectedLogConfigPath?: string;
  requiredLogConfig?: string;
```

- [ ] **Step 4: Make `missingDiagnostic` platform-aware and thread `env` through**

In `packages/hearthwatcher/src/log-paths.ts`:

First, add this import near the top (after line 4, the diagnostics-type import):

```ts
import { logConfigPath, REQUIRED_LOG_CONFIG } from './log-config';
```

Move the `env` resolution to the top of `discoverPowerLog` so the override branch can pass it to `missingDiagnostic`. Replace the start of the function body — change lines 25-36 so that:

```ts
  const exists = options.exists ?? pathExists;
  const readDir = options.readDir ?? readdir;
  const env = options.env ?? process.env;
  if (options.overridePath !== undefined) {
    const found = await exists(options.overridePath);
    return {
      powerLogPath: found ? options.overridePath : null,
      searchedPaths: [options.overridePath],
      diagnostic: found ? null : missingDiagnostic([options.overridePath], env),
    };
  }

  const explicitCandidates = uniquePaths(options.candidatePaths ?? []);
```

(Delete the now-duplicate `const env = options.env ?? process.env;` that previously sat on line 36.)

Update the final missing-log return (lines 81-85) to pass `env`:

```ts
  return {
    powerLogPath: null,
    searchedPaths: [...searchedPaths, ...scannedPaths],
    diagnostic: missingDiagnostic([...searchedPaths, ...scannedPaths], env),
  };
```

Finally, replace the `missingDiagnostic` function (lines 210-217) with:

```ts
function missingDiagnostic(
  searchedPaths: string[],
  env: NodeJS.ProcessEnv,
): HearthWatcherDiagnostic {
  const isMac = Boolean(env.HOME) && !env.LOCALAPPDATA;
  if (isMac) {
    let expectedLogConfigPath: string | undefined;
    try {
      expectedLogConfigPath = logConfigPath(env);
    } catch {
      expectedLogConfigPath = undefined;
    }
    return {
      kind: 'missing-log',
      message:
        'Power.log was not found. Create the Hearthstone log.config with a [Power] section, then restart Hearthstone.',
      searchedPaths,
      expectedLogConfigPath,
      requiredLogConfig: REQUIRED_LOG_CONFIG,
      timestamp: Date.now(),
    };
  }
  return {
    kind: 'missing-log',
    message: 'Power.log was not found. Enable Hearthstone logging and restart the game.',
    searchedPaths,
    timestamp: Date.now(),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @hdt/hearthwatcher test log-paths`
Expected: PASS — the macOS diagnostic test is green; the existing `returns missing-log diagnostic for missing override` test still passes (it only asserts `kind`).

- [ ] **Step 6: Commit**

```bash
git add packages/hearthwatcher/src/types/diagnostics.ts packages/hearthwatcher/src/log-paths.ts packages/hearthwatcher/src/__tests__/log-paths.test.ts
git commit -m "feat(hearthwatcher): add actionable macOS missing-log diagnostic

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Full package verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm --filter @hdt/hearthwatcher test`
Expected: PASS with zero failures on the dev machine (macOS). Windows-only tests report as skipped; macOS tests run.

- [ ] **Step 2: Typecheck the package**

Run: `pnpm --filter @hdt/hearthwatcher typecheck`
Expected: PASS — no type errors.

- [ ] **Step 3: Confirm the public exports resolve**

Run: `pnpm --filter @hdt/hearthwatcher exec node --input-type=module -e "import('./src/index.ts').catch(() => {}); console.log('ok')"`

If the package cannot be imported directly as `.ts`, instead grep the index to confirm all five functions/constants and four types are exported:

Run: `grep -nE "ensureLogConfig|ensureClientConfig|logConfigPath|REQUIRED_LOG_CONFIG|CLIENT_CONFIG_CONTENTS" packages/hearthwatcher/src/index.ts`
Expected: the export lines added in Task 3 are present.

- [ ] **Step 4: Final commit (if Step 3 required any export fix)**

```bash
git add -A
git commit -m "chore(hearthwatcher): finalize macOS log support exports

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

If no changes were needed in Step 3, skip this commit.

---

## Notes for the implementer

- **Do not wire any of this into the Electron app.** These are package-level utilities only; app integration and live-game verification are explicitly out of scope (see the spec's Non-goals).
- **The writers are never auto-invoked.** `ensureLogConfig` / `ensureClientConfig` exist for a future user-consented guided flow. Calling them on startup would violate the project's `add-hearthwatcher` design decision.
- **Why `it.runIf(process.platform === 'win32')`:** the existing Windows-literal tests rely on ambient `node:path` `join` producing backslashes, which only happens on Windows. CI runs on `windows-latest`, so they still execute there; the guard just makes the suite green locally on macOS too.
- **Why `posix.join` for macOS candidates:** it produces forward slashes on every OS, so the macOS path tests pass on both the dev machine and Windows CI — giving the new code real CI coverage.
```
