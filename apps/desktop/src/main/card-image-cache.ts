import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

/**
 * Disk-cache version for the trimmed-tile pipeline. Bump whenever the
 * trim algorithm changes in a way that requires re-processing existing
 * caches (e.g. threshold tuning, new bleed-detection logic). Old
 * `tiles-v{N-1}/` directories are wiped at startup by
 * `cleanLegacyTileCacheDirs` so users automatically pick up the new
 * pipeline without manual intervention.
 */
export const CARD_TILE_CACHE_VERSION = 'v2';
const CARD_TILE_CACHE_DIR = `tiles-${CARD_TILE_CACHE_VERSION}`;

export const CARD_IMAGE_PRIMARY_LOCALE = 'zhCN';
export const CARD_IMAGE_FALLBACK_LOCALE = 'enUS';
export const CARD_IMAGE_SIZE = '256x';
export const CARD_IMAGE_PROTOCOL = 'hdt-card-image';
export const CARD_IMAGE_BASE_URL = 'https://art.hearthstonejson.com/v1/render/latest';
// Frame-less, fade-less card portrait art used for the inline row sliver.
// We use /v1/orig/<id>.png — the original, lossless artwork. Trade-off:
// files are larger (~200-800 KB) but the disk cache makes that a one-time
// cost per cardId. /v1/tiles/<id>.png ships a baked-in left fade designed
// for HS's own UI and produced visible white edges; /v1/256x/<id>.jpg is
// down-sampled and slightly soft on HiDPI displays.
export const CARD_TILE_BASE_URL = 'https://art.hearthstonejson.com/v1/orig';
export const CARD_TILE_EXTENSION = 'png';

const CARD_ID_RE = /^[A-Za-z0-9_]+$/;
const SEGMENT_RE = /^[A-Za-z0-9_-]+$/;

export interface CardImageCachePathOptions {
  root: string;
  locale: string;
  size: string;
  cardId: string;
}

export interface EnsureCardImageCachedOptions {
  root: string;
  primaryLocale?: string;
  fallbackLocale?: string;
  size?: string;
  force?: boolean;
  fetchImpl?: typeof fetch;
}

export interface CachedCardImage {
  cardId: string;
  locale: string;
  size: string;
  path: string;
  url: string;
}

export function defaultCardImageCacheRoot(userDataPath: string): string {
  return path.join(userDataPath, 'card-images');
}

export function assertValidCardId(cardId: string): void {
  if (!CARD_ID_RE.test(cardId)) {
    throw new Error(`invalid cardId: ${cardId}`);
  }
}

function assertValidSegment(label: string, segment: string): void {
  if (!SEGMENT_RE.test(segment)) {
    throw new Error(`invalid ${label}: ${segment}`);
  }
}

export function cardImageCachePath({
  root,
  locale,
  size,
  cardId,
}: CardImageCachePathOptions): string {
  assertValidCardId(cardId);
  assertValidSegment('locale', locale);
  assertValidSegment('size', size);

  const rootPath = path.resolve(root);
  const resolved = path.resolve(rootPath, locale, size, `${cardId}.png`);
  const relative = path.relative(rootPath, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('invalid cache path outside card image root');
  }
  return resolved;
}

export function buildRemoteCardImageUrl(cardId: string, locale: string, size = CARD_IMAGE_SIZE): string {
  assertValidCardId(cardId);
  assertValidSegment('locale', locale);
  assertValidSegment('size', size);
  return `${CARD_IMAGE_BASE_URL}/${locale}/${size}/${cardId}.png`;
}

export function cardImageCacheUrl({
  locale,
  size,
  cardId,
}: Omit<CardImageCachePathOptions, 'root'>): string {
  assertValidCardId(cardId);
  assertValidSegment('locale', locale);
  assertValidSegment('size', size);
  return `${CARD_IMAGE_PROTOCOL}://cache/${locale}/${size}/${cardId}.png`;
}

export function cardImageCachePathFromUrl(url: string, root: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== `${CARD_IMAGE_PROTOCOL}:`) {
    throw new Error('invalid card image cache URL');
  }

  // Tile URL: hdt-card-image://tile/<cardId>.<ext>
  if (parsed.hostname === 'tile') {
    const parts = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts.length !== 1) {
      throw new Error('invalid card tile cache URL');
    }
    const fileName = parts[0]!;
    const expectedSuffix = `.${CARD_TILE_EXTENSION}`;
    if (!fileName.endsWith(expectedSuffix)) {
      throw new Error('invalid card tile cache URL');
    }
    const cardId = fileName.slice(0, -expectedSuffix.length);
    return cardTileCachePath({ root, cardId });
  }

  // Render URL: hdt-card-image://cache/<locale>/<size>/<cardId>.png
  if (parsed.hostname !== 'cache') {
    throw new Error('invalid card image cache URL');
  }

  const parts = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length !== 3) {
    throw new Error('invalid card image cache URL');
  }

  const [locale, size, fileName] = parts;
  if (!locale || !size || !fileName?.endsWith('.png')) {
    throw new Error('invalid card image cache URL');
  }

  const cardId = fileName.slice(0, -'.png'.length);
  return cardImageCachePath({ root, locale, size, cardId });
}

export interface CardTileCachePathOptions {
  root: string;
  cardId: string;
}

export interface EnsureCardTileCachedOptions {
  root: string;
  force?: boolean;
  fetchImpl?: typeof fetch;
}

export interface CachedCardTile {
  cardId: string;
  path: string;
  url: string;
}

export function cardTileCachePath({ root, cardId }: CardTileCachePathOptions): string {
  assertValidCardId(cardId);

  const rootPath = path.resolve(root);
  const resolved = path.resolve(rootPath, CARD_TILE_CACHE_DIR, `${cardId}.${CARD_TILE_EXTENSION}`);
  const relative = path.relative(rootPath, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('invalid cache path outside card image root');
  }
  return resolved;
}

/**
 * Best-effort one-shot cleanup of legacy or older-versioned tile cache
 * directories. Removes:
 *   - the unversioned `tiles/` directory (pre-versioning baseline), and
 *   - any `tiles-vN/` directory whose suffix differs from the current
 *     `CARD_TILE_CACHE_VERSION`.
 *
 * Designed to be fired-and-forgotten at app startup. Failures are
 * logged by the caller and do not block tile cache reads / writes.
 */
export async function cleanLegacyTileCacheDirs(root: string): Promise<string[]> {
  const removed: string[] = [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return removed;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const isLegacyUnversioned = name === 'tiles';
    const isOlderVersion = name.startsWith('tiles-v') && name !== CARD_TILE_CACHE_DIR;
    if (!isLegacyUnversioned && !isOlderVersion) continue;

    try {
      await rm(path.join(root, name), { recursive: true, force: true });
      removed.push(name);
    } catch {
      // Ignore individual failures — cache will simply remain orphaned.
    }
  }
  return removed;
}

export function cardTileCacheUrl({ cardId }: { cardId: string }): string {
  assertValidCardId(cardId);
  return `${CARD_IMAGE_PROTOCOL}://tile/${cardId}.${CARD_TILE_EXTENSION}`;
}

export function buildRemoteCardTileUrl(cardId: string): string {
  assertValidCardId(cardId);
  return `${CARD_TILE_BASE_URL}/${cardId}.${CARD_TILE_EXTENSION}`;
}

export async function ensureCardTileCached(
  cardId: string,
  options: EnsureCardTileCachedOptions,
): Promise<CachedCardTile> {
  assertValidCardId(cardId);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  const tilePath = cardTileCachePath({ root: options.root, cardId });
  const tileUrl = cardTileCacheUrl({ cardId });

  if (!options.force && await fileExists(tilePath)) {
    return { cardId, path: tilePath, url: tileUrl };
  }

  const response = await fetchImpl(buildRemoteCardTileUrl(cardId));
  if (!response.ok) {
    throw new Error(`failed to download card tile ${cardId}: ${response.status}`);
  }
  const raw = Buffer.from(await response.arrayBuffer());
  const trimmed = trimWhiteBorders(raw);
  await writeBufferAtomic(tilePath, trimmed);

  return { cardId, path: tilePath, url: tileUrl };
}

/**
 * Strip the white compositing border that HearthstoneJSON's `/v1/orig/`
 * tiles ship — they pad non-square original artwork to 512x512 by adding
 * pure-white bleed regions on either left+right (portrait sources) or
 * top+bottom (landscape sources). Empirical worst case across the active
 * card pool is ~15% per side; this function detects each card's actual
 * border thickness and crops it precisely, preserving the centered
 * character / scene composition exactly.
 *
 * Falls back to the original buffer (no crop) if:
 * - the buffer doesn't decode as a PNG (e.g. test stubs),
 * - the image is entirely near-white (would crop to 0×0),
 * - or a sanity check fails (cropped dims < 50% of original on any axis,
 *   which would indicate a malformed scan rather than a legitimate trim).
 */
export function trimWhiteBorders(buffer: Buffer): Buffer {
  let png: PNG;
  try {
    png = PNG.sync.read(buffer);
  } catch {
    return buffer;
  }

  const { width, height, data } = png;
  const isWhite = (x: number, y: number): boolean => {
    const idx = (y * width + x) * 4;
    return (
      (data[idx] ?? 0) >= WHITE_THRESHOLD &&
      (data[idx + 1] ?? 0) >= WHITE_THRESHOLD &&
      (data[idx + 2] ?? 0) >= WHITE_THRESHOLD
    );
  };
  const rowAllWhite = (y: number): boolean => {
    for (let x = 0; x < width; x++) if (!isWhite(x, y)) return false;
    return true;
  };
  const colAllWhite = (x: number): boolean => {
    for (let y = 0; y < height; y++) if (!isWhite(x, y)) return false;
    return true;
  };

  let top = 0;
  while (top < height && rowAllWhite(top)) top++;
  if (top === height) return buffer; // entirely white — bail

  let bottom = height - 1;
  while (bottom > top && rowAllWhite(bottom)) bottom--;

  let left = 0;
  while (left < width && colAllWhite(left)) left++;

  let right = width - 1;
  while (right > left && colAllWhite(right)) right--;

  const newW = right - left + 1;
  const newH = bottom - top + 1;

  if (newW < width / 2 || newH < height / 2) return buffer;
  if (top === 0 && left === 0 && bottom === height - 1 && right === width - 1) {
    return buffer;
  }

  const cropped = new PNG({ width: newW, height: newH });
  PNG.bitblt(png, cropped, left, top, newW, newH, 0, 0);
  return PNG.sync.write(cropped);
}

const WHITE_THRESHOLD = 245;

async function writeBufferAtomic(filePath: string, bytes: Buffer): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, bytes);
  await rename(tempPath, filePath);
}

export async function ensureCardImageCached(
  cardId: string,
  options: EnsureCardImageCachedOptions,
): Promise<CachedCardImage> {
  assertValidCardId(cardId);
  const primaryLocale = options.primaryLocale ?? CARD_IMAGE_PRIMARY_LOCALE;
  const fallbackLocale = options.fallbackLocale ?? CARD_IMAGE_FALLBACK_LOCALE;
  const size = options.size ?? CARD_IMAGE_SIZE;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  const primary = cacheEntry(options.root, primaryLocale, size, cardId);
  if (!options.force && await fileExists(primary.path)) return primary;

  const fallback = cacheEntry(options.root, fallbackLocale, size, cardId);
  if (!options.force && await fileExists(fallback.path)) return fallback;

  const primaryResponse = await fetchImpl(buildRemoteCardImageUrl(cardId, primaryLocale, size));
  if (primaryResponse.ok) {
    await writeResponse(primary.path, primaryResponse);
    return primary;
  }

  const fallbackResponse = await fetchImpl(buildRemoteCardImageUrl(cardId, fallbackLocale, size));
  if (fallbackResponse.ok) {
    await writeResponse(fallback.path, fallbackResponse);
    return fallback;
  }

  throw new Error(`failed to download card image ${cardId}`);
}

function cacheEntry(root: string, locale: string, size: string, cardId: string): CachedCardImage {
  const imagePath = cardImageCachePath({ root, locale, size, cardId });
  return {
    cardId,
    locale,
    size,
    path: imagePath,
    url: cardImageCacheUrl({ locale, size, cardId }),
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

async function writeResponse(filePath: string, response: Response): Promise<void> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, bytes);
  await rename(tempPath, filePath);
}
