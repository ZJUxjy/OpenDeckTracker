import { mkdir, stat, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

import { CARD_IMAGE_PROTOCOL } from './card-image-cache';

/**
 * Set-logo cache. Hand-curated mapping of HS set codes to Blizzard's
 * marketing CDN URL for the expansion title logo. URLs come from
 * `hearthstone.blizzard.com/en-us/expansions-adventures/<slug>` — they
 * are Akamai-hosted, stable across patches, and CORS-permissive.
 *
 * Sets without a known logo (e.g. SET_1810 Core, SET_1941 Event) are
 * simply absent from the map; `ensureSetLogoCached` returns null for
 * those and the renderer falls back to the representative-card cover.
 *
 * Cache lives at `<cardImageRoot>/set-logos/<setCode>.png`, served via
 * the same `hdt-card-image://` protocol with hostname `set-logo`.
 */

const SET_CODE_RE = /^[A-Za-z0-9_]+$/;

export const SET_LOGO_URLS: Record<string, string> = {
  // ── Standard rotation ─────────────────────────────────────────
  SET_1946: 'https://blz-contentstack-images.akamaized.net/v3/assets/bltc965041283bac56c/blt10f09c595ce577d9/67ad9eabf887ad6cef9fafb2/HS_32p0_TED_Logo_Launch_enUS_5500x3422.png',
  SET_1952: 'https://blz-contentstack-images.akamaized.net/v3/assets/bltc965041283bac56c/bltc155dfa7caf0d8c5/6830c93e8c0c5b0a6cfff161/HS_32p0_TED_Logo_Launch_enUS_5500x3422.png',
  SET_1957: 'https://blz-contentstack-images.akamaized.net/v3/assets/bltc965041283bac56c/blt5525df54955ed8dd/68d2fab6d848545506c3c36b/HS_34p0_AtT_Logo_Launch_enUS.png',
  SET_1980: 'https://blz-contentstack-images.akamaized.net/v3/assets/bltc965041283bac56c/bltfb9c4943510acbec/697428b3a4d899c3e0ea5e94/HS_35p0_CATA_Logo_Launch_enUS.png',

  // ── Wild — recent rotation (still have a live /expansions-adventures page) ─
  SET_1935: 'https://blz-contentstack-images.akamaized.net/v3/assets/bltc965041283bac56c/blt932b62c77646094b/67c6539f1d41b823c047b59b/enUS.png', // The Great Dark Beyond
  SET_1905: 'https://blz-contentstack-images.akamaized.net/v3/assets/bltc965041283bac56c/bltf47e4b4f43c7112c/67c653e1596fa442d7f3c253/enUS.png', // Perils in Paradise
  SET_1897: 'https://blz-contentstack-images.akamaized.net/v3/assets/bltc965041283bac56c/blt70f8dfc1b94f729c/65b16dd27aa31f5699d29bae/HS_29p0_WBWS_Launch_enUS_5500x3422.png', // Whizbang's Workshop
  SET_1892: 'https://blz-contentstack-images.akamaized.net/v3/assets/bltc965041283bac56c/blt1e00dbdaf5caa1d8/651d83af903f1f4cb0f8af6a/HS_28p0_Logo_launch_enUS_5500x3422.png', // Showdown in the Badlands
  SET_1858: 'https://blz-contentstack-images.akamaized.net/v3/assets/bltc965041283bac56c/bltb60e1a588969540b/683e2bd27809205ae5d588ff/HS_27p0_Logo_launch_enUS_5500x3422.png', // TITANS
  SET_1809: 'https://blz-contentstack-images.akamaized.net/v3/assets/bltc965041283bac56c/blt3c76dcbed75a462a/63ff7de4998e686b2e53b8ef/HS_26p0_Logo_launch_enUS.png', // Festival of Legends
};

export interface CachedSetLogo {
  setCode: string;
  path: string;
  url: string;
}

export function setLogoCachePath(root: string, setCode: string): string {
  if (!SET_CODE_RE.test(setCode)) {
    throw new Error(`invalid setCode: ${setCode}`);
  }
  const rootPath = path.resolve(root);
  const resolved = path.resolve(rootPath, 'set-logos', `${setCode}.png`);
  const relative = path.relative(rootPath, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('invalid set-logo path outside card image root');
  }
  return resolved;
}

export function setLogoCacheUrl(setCode: string): string {
  if (!SET_CODE_RE.test(setCode)) {
    throw new Error(`invalid setCode: ${setCode}`);
  }
  return `${CARD_IMAGE_PROTOCOL}://set-logo/${setCode}.png`;
}

export function setLogoCachePathFromUrl(url: string, root: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== `${CARD_IMAGE_PROTOCOL}:` || parsed.hostname !== 'set-logo') {
    throw new Error('invalid set-logo cache URL');
  }
  const parts = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length !== 1 || !parts[0]!.endsWith('.png')) {
    throw new Error('invalid set-logo cache URL');
  }
  const setCode = parts[0]!.slice(0, -'.png'.length);
  return setLogoCachePath(root, setCode);
}

const inFlight = new Map<string, Promise<CachedSetLogo | null>>();

export interface EnsureSetLogoCachedOptions {
  root: string;
  force?: boolean;
  fetchImpl?: typeof fetch;
}

export async function ensureSetLogoCached(
  setCode: string,
  options: EnsureSetLogoCachedOptions,
): Promise<CachedSetLogo | null> {
  const remoteUrl = SET_LOGO_URLS[setCode];
  if (!remoteUrl) return null;

  const filePath = setLogoCachePath(options.root, setCode);
  const url = setLogoCacheUrl(setCode);

  if (!options.force) {
    try {
      const info = await stat(filePath);
      if (info.size > 0) return { setCode, path: filePath, url };
    } catch {
      // not cached yet
    }
  }

  const key = `${options.root}:${setCode}:${options.force ?? false}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = downloadSetLogo(setCode, remoteUrl, filePath, url, options.fetchImpl);
  inFlight.set(key, promise);
  promise.finally(() => { inFlight.delete(key); });
  return promise;
}

async function downloadSetLogo(
  setCode: string,
  remoteUrl: string,
  filePath: string,
  url: string,
  fetchImpl?: typeof fetch,
): Promise<CachedSetLogo | null> {
  const f = fetchImpl ?? globalThis.fetch;
  try {
    const response = await f(remoteUrl);
    if (!response.ok) {
      console.error(`[set-logo-cache] ${setCode} HTTP ${response.status}`);
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tmpPath, buffer);
    await rename(tmpPath, filePath);
    return { setCode, path: filePath, url };
  } catch (e) {
    console.error(`[set-logo-cache] ${setCode} download failed`, (e as Error).message);
    return null;
  }
}
