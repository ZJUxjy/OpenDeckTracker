import { execSync } from 'node:child_process';
import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { HearthWatcherDiagnostic } from './types/diagnostics';

export interface LogDiscoveryOptions {
  overridePath?: string;
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => Promise<boolean>;
  readDir?: (path: string) => Promise<string[]>;
  candidatePaths?: string[];
  installDirs?: string[];
  detectInstallDir?: () => string | null;
}

export interface LogDiscoveryResult {
  powerLogPath: string | null;
  searchedPaths: string[];
  diagnostic: HearthWatcherDiagnostic | null;
}

export async function discoverPowerLog(
  options: LogDiscoveryOptions = {},
): Promise<LogDiscoveryResult> {
  const exists = options.exists ?? pathExists;
  const readDir = options.readDir ?? readdir;
  if (options.overridePath !== undefined) {
    const found = await exists(options.overridePath);
    return {
      powerLogPath: found ? options.overridePath : null,
      searchedPaths: [options.overridePath],
      diagnostic: found ? null : missingDiagnostic([options.overridePath]),
    };
  }

  const env = options.env ?? process.env;
  const explicitCandidates = uniquePaths(options.candidatePaths ?? []);
  for (const candidate of explicitCandidates) {
    if (await exists(candidate)) {
      return { powerLogPath: candidate, searchedPaths: explicitCandidates, diagnostic: null };
    }
  }

  let searchedPaths = uniquePaths([
    ...standardPowerLogPaths(env),
    ...explicitCandidates,
  ]);

  // Detect the Hearthstone install directory from the running process
  // and add its Logs/ path. This covers non-standard installs (e.g.
  // Battle.net CN on a custom drive).
  const installDirs = uniquePaths([
    ...(options.installDirs ?? []),
    ...detectedInstallDirs(options.detectInstallDir ?? detectHearthstoneInstallDir),
  ]);
  for (const hsInstallDir of installDirs) {
    const installLogPath = join(hsInstallDir, 'Logs', 'Power.log');
    searchedPaths = uniquePaths([...searchedPaths, installLogPath]);
  }

  // Hearthstone on some installs writes to timestamped subdirectories
  // under Logs/ (e.g. Logs/Hearthstone_2026_04_27_15_34_09/Power.log).
  // Prefer the newest timestamped log over a root Logs/Power.log, because
  // Hearthstone can leave stale root logs behind while writing active games
  // into per-run directories.
  const scannedPaths = await scanTimestampedLogDirs(env, searchedPaths, exists, readDir, installDirs);
  if (scannedPaths.length > 0) {
    return {
      powerLogPath: scannedPaths[0]!,
      searchedPaths: [...searchedPaths, ...scannedPaths],
      diagnostic: null,
    };
  }

  for (const candidate of searchedPaths) {
    if (await exists(candidate)) {
      return { powerLogPath: candidate, searchedPaths, diagnostic: null };
    }
  }

  return {
    powerLogPath: null,
    searchedPaths: [...searchedPaths, ...scannedPaths],
    diagnostic: missingDiagnostic([...searchedPaths, ...scannedPaths]),
  };
}

export function standardPowerLogPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const candidates: string[] = [];
  if (env.LOCALAPPDATA) {
    candidates.push(join(env.LOCALAPPDATA, 'Blizzard', 'Hearthstone', 'Logs', 'Power.log'));
  }
  if (env.ProgramFiles) {
    candidates.push(join(env.ProgramFiles, 'Hearthstone', 'Logs', 'Power.log'));
  }
  if (env['ProgramFiles(x86)']) {
    candidates.push(join(env['ProgramFiles(x86)'], 'Hearthstone', 'Logs', 'Power.log'));
  }
  return [...new Set(candidates)];
}

/**
 * Locate the running Hearthstone process and return its install directory.
 * Uses PowerShell on Windows (more reliably available than WMIC); returns
 * `null` on any failure.
 */
function detectHearthstoneInstallDir(): string | null {
  if (process.platform !== 'win32') return null;
  try {
    const psCmd =
      'Get-Process -Name Hearthstone -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path';
    const out = execSync(psCmd, {
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true,
      shell: 'powershell.exe',
    });
    const exe = out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? '';
    if (exe.length > 0) {
      return exe.replace(/[\\/]Hearthstone\.exe$/i, '');
    }
  } catch {
    // Fallback: scan common install roots for Hearthstone dirs.
    const roots = ['C:', 'D:', 'E:', 'F:', 'G:'];
    for (const root of roots) {
      for (const sub of ['battle\\Hearthstone', 'Hearthstone']) {
        const candidate = `${root}\\${sub}\\`;
        try {
          require('node:fs').accessSync(candidate);
          return candidate.replace(/[\\/]$/, '');
        } catch {
          // ignore
        }
      }
    }
  }
  return null;
}

/**
 * For each unique *parent* Logs directory among `searchedPaths`, scan for
 * `Hearthstone_*` subdirectories and collect their `Power.log` paths, sorted
 * newest-first by directory name (which includes an ISO-like timestamp).
 */
async function scanTimestampedLogDirs(
  env: NodeJS.ProcessEnv,
  searchedPaths: string[],
  exists: (path: string) => Promise<boolean>,
  readDir: (path: string) => Promise<string[]>,
  installDirs: string[],
): Promise<string[]> {
  // Derive unique parent directories from the standard paths.
  const logDirs = new Set<string>();
  for (const p of searchedPaths) {
    // p is .../Logs/Power.log → parent is .../Logs
    const parent = p.replace(/[\\/]Power\.log$/i, '');
    logDirs.add(parent);
  }
  if (env['ProgramFiles(x86)']) {
    logDirs.add(join(env['ProgramFiles(x86)'], 'Hearthstone', 'Logs'));
  }
  for (const hsInstallDir of installDirs) {
    logDirs.add(join(hsInstallDir, 'Logs'));
  }

  const results: string[] = [];
  for (const dir of logDirs) {
    let entries: string[];
    try {
      entries = await readDir(dir);
    } catch {
      continue;
    }
    // Filter for Hearthstone_YYYY_MM_DD_HH_MM_SS directories.
    const tsDirs = entries
      .filter((e) => /^Hearthstone_\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2}$/.test(e))
      .sort()
      .reverse(); // newest first (ISO timestamp sorts lexicographically)
    for (const tsDir of tsDirs) {
      const powerLog = join(dir, tsDir, 'Power.log');
      if (await exists(powerLog)) {
        results.push(powerLog);
      }
    }
  }
  return results;
}

function detectedInstallDirs(detectInstallDir: () => string | null): string[] {
  const detected = detectInstallDir();
  return detected === null ? [] : [detected];
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.filter((path) => path.length > 0))];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function missingDiagnostic(searchedPaths: string[]): HearthWatcherDiagnostic {
  return {
    kind: 'missing-log',
    message: 'Power.log was not found. Enable Hearthstone logging and restart the game.',
    searchedPaths,
    timestamp: Date.now(),
  };
}
