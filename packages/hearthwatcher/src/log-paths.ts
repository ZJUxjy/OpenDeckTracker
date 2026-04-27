import { access } from 'node:fs/promises';
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

  return {
    powerLogPath: null,
    searchedPaths,
    diagnostic: missingDiagnostic(searchedPaths),
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
