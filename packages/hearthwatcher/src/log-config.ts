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
