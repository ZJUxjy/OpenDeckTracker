import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { HearthWatcherDiagnostic } from './types/diagnostics';

export interface LogDiscoveryOptions {
  overridePath?: string;
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => Promise<boolean>;
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
  if (options.overridePath !== undefined) {
    const found = await exists(options.overridePath);
    return {
      powerLogPath: found ? options.overridePath : null,
      searchedPaths: [options.overridePath],
      diagnostic: found ? null : missingDiagnostic([options.overridePath]),
    };
  }

  const env = options.env ?? process.env;
  const searchedPaths = standardPowerLogPaths(env);
  for (const candidate of searchedPaths) {
    if (await exists(candidate)) {
      return { powerLogPath: candidate, searchedPaths, diagnostic: null };
    }
  }

  // Hearthstone on some installs (especially Battle.net CN) writes to
  // timestamped subdirectories under Logs/ (e.g. Logs/Hearthstone_2026_04_27_15_34_09/Power.log).
  // Scan parent log dirs for the most recent one.
  const scannedPaths = await scanTimestampedLogDirs(env, searchedPaths, exists);
  if (scannedPaths.length > 0) {
    return {
      powerLogPath: scannedPaths[0]!,
      searchedPaths: [...searchedPaths, ...scannedPaths],
      diagnostic: null,
    };
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
 * For each unique *parent* Logs directory among `searchedPaths`, scan for
 * `Hearthstone_*` subdirectories and collect their `Power.log` paths, sorted
 * newest-first by directory name (which includes an ISO-like timestamp).
 */
async function scanTimestampedLogDirs(
  env: NodeJS.ProcessEnv,
  searchedPaths: string[],
  exists: (path: string) => Promise<boolean>,
): Promise<string[]> {
  // Derive unique parent directories from the standard paths.
  const logDirs = new Set<string>();
  for (const p of searchedPaths) {
    // p is .../Logs/Power.log → parent is .../Logs
    const parent = p.replace(/[\\/]Power\.log$/i, '');
    logDirs.add(parent);
  }
  // Also check the game install's Logs if we can infer it from program paths.
  if (env['ProgramFiles(x86)']) {
    logDirs.add(join(env['ProgramFiles(x86)'], 'Hearthstone', 'Logs'));
  }

  const results: string[] = [];
  for (const dir of logDirs) {
    let entries: string[];
    try {
      entries = await readdir(dir);
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
