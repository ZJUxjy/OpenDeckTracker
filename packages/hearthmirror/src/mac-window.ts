import { createRequire } from 'node:module';
import type { HearthstoneWindow } from './types';

/** Minimal surface of the macOS window addon (`@hdt/hs-window-mac`). */
export interface MacWindowProvider {
  getHearthstoneWindow(): HearthstoneWindow | null;
}

const defaultRequire = createRequire(import.meta.url) as (id: string) => unknown;

/**
 * Load the macOS window addon, or return `null` when unavailable.
 * `platform`/`requireFn` are injectable for tests. On non-darwin, or when the
 * addon isn't built (require throws), returns null so the facade falls back to
 * "no window" — exactly today's behavior on platforms without the addon.
 */
export function loadMacWindowProvider(
  platform: NodeJS.Platform = process.platform,
  requireFn: (id: string) => unknown = defaultRequire,
): MacWindowProvider | null {
  if (platform !== 'darwin') return null;
  try {
    const addon = requireFn('@hdt/hs-window-mac') as MacWindowProvider;
    return typeof addon.getHearthstoneWindow === 'function' ? addon : null;
  } catch {
    return null;
  }
}
