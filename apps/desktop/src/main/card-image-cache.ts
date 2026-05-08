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

/**
 * Default soft ceiling on the on-disk card-image cache (renders + tiles
 * combined). Ballpark: 30 cards/match × ~250 KB per orig PNG × every
 * unique deck a user encounters, plus the much larger render PNGs for
 * popovers; without a cap this can drift past 1 GB. 500 MB is generous
 * for 6+ months of casual play and trims itself transparently.
 */
export const DEFAULT_CARD_IMAGE_CACHE_CAP_BYTES = 500 * 1024 * 1024;

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
 * Walk the entire card-image cache root and evict the least-recently-used
 * image files until the total disk footprint sits at or below `capBytes`.
 *
 * Both the trimmed-tile cache (`tiles-v2/`) and the per-locale render
 * cache (`zhCN/256x/`, `enUS/256x/`) are included — every file with a
 * `.png` / `.jpg` / `.jpeg` extension under the root counts toward the
 * cap. Eviction order is oldest mtime first, regardless of which
 * sub-cache the file came from. The protocol handler streams from disk
 * on every read, so deletion is safe at any time — a subsequent request
 * for a deleted card simply triggers a re-download via
 * `ensureCardImageCached` / `ensureCardTileCached`.
 *
 * Designed to be fired-and-forgotten at app startup. Returns the bytes
 * freed and the number of files removed; failures on individual files
 * are swallowed so a single unreadable file doesn't abort the sweep.
 */
export async function enforceCardImageCacheCap(
  root: string,
  capBytes: number,
): Promise<{ freedBytes: number; removedCount: number }> {
  let entries: { path: string; size: number; mtimeMs: number }[];
  try {
    entries = await collectCacheEntries(root);
  } catch {
    return { freedBytes: 0, removedCount: 0 };
  }

  const totalBytes = entries.reduce((sum, e) => sum + e.size, 0);
  if (totalBytes <= capBytes) {
    return { freedBytes: 0, removedCount: 0 };
  }

  // LRU: oldest-touched files go first.
  entries.sort((a, b) => a.mtimeMs - b.mtimeMs);

  let freedBytes = 0;
  let removedCount = 0;
  let runningTotal = totalBytes;

  for (const entry of entries) {
    if (runningTotal <= capBytes) break;
    try {
      await rm(entry.path, { force: true });
      freedBytes += entry.size;
      runningTotal -= entry.size;
      removedCount++;
    } catch {
      // Skip — file may already have been removed or be locked. The
      // sweep continues; the cap is best-effort.
    }
  }
  // Files were removed — stale existence entries would cause us to skip
  // re-downloads for evicted cards. Clear the map so the next lookup
  // re-stats from disk.
  if (removedCount > 0) {
    clearFileExistenceCache();
  }

  return { freedBytes, removedCount };
}

const IMAGE_FILE_RE = /\.(png|jpe?g)$/i;

async function collectCacheEntries(
  root: string,
): Promise<{ path: string; size: number; mtimeMs: number }[]> {
  const out: { path: string; size: number; mtimeMs: number }[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let dirents: import('node:fs').Dirent[];
    try {
      dirents = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const dirent of dirents) {
      const full = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        stack.push(full);
      } else if (dirent.isFile() && IMAGE_FILE_RE.test(dirent.name)) {
        try {
          const info = await stat(full);
          out.push({ path: full, size: info.size, mtimeMs: info.mtimeMs });
        } catch {
          // Ignore.
        }
      }
    }
  }
  return out;
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

  const tilePath = cardTileCachePath({ root: options.root, cardId });
  const tileUrl = cardTileCacheUrl({ cardId });

  if (!options.force && await fileExists(tilePath)) {
    return { cardId, path: tilePath, url: tileUrl };
  }

  // Deduplicate concurrent tile downloads.
  const key = tileDedupKey(cardId, options);
  const existing = tileDownloadInFlight.get(key);
  if (existing) return existing;

  const promise = downloadCardTile(cardId, options, tilePath, tileUrl);
  tileDownloadInFlight.set(key, promise);
  promise.then(
    () => { tileDownloadInFlight.delete(key); },
    () => { tileDownloadInFlight.delete(key); },
  );
  return promise;
}

async function downloadCardTile(
  cardId: string,
  options: EnsureCardTileCachedOptions,
  tilePath: string,
  tileUrl: string,
): Promise<CachedCardTile> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const response = await fetchWithRetry(buildRemoteCardTileUrl(cardId), fetchImpl);
  if (!response.ok) {
    throw new Error(`failed to download card tile ${cardId}: ${response.status}`);
  }
  const raw = Buffer.from(await response.arrayBuffer());
  const trimmed = trimWhiteBorders(raw);
  await writeBufferAtomic(tilePath, trimmed);

  return { cardId, path: tilePath, url: tileUrl };
}

/** Batch variant of {@link ensureCardImageCached}. Parallel, never throws —
 *  failures surface as `null` entries so the renderer can skip the image. */
async function batchLoad<T>(
  cardIds: readonly string[],
  load: (cardId: string) => Promise<T>,
): Promise<(T | null)[]> {
  return Promise.all(
    cardIds.map(async (cardId) => {
      try {
        return await load(cardId);
      } catch {
        return null;
      }
    }),
  );
}

export async function ensureCardImagesCachedBatch(
  cardIds: readonly string[],
  options: EnsureCardImageCachedOptions,
): Promise<(CachedCardImage | null)[]> {
  return batchLoad(cardIds, (id) => ensureCardImageCached(id, options));
}

export async function ensureCardTilesCachedBatch(
  cardIds: readonly string[],
  options: EnsureCardTileCachedOptions,
): Promise<(CachedCardTile | null)[]> {
  return batchLoad(cardIds, (id) => ensureCardTileCached(id, options));
}

/**
 * Fetch with a small retry loop for transient failures. Without this a
 * single network blip leaves the in-game overlay tile blank for the rest
 * of the session: the renderer hook only retries when the component
 * remounts, but the overlay BrowserWindow stays mounted across matches.
 *
 * Retries on:
 *  - thrown errors (DNS/connection failures)
 *  - HTTP 5xx (CDN-side hiccups)
 *  - HTTP 408 / 429 (timeout / rate-limit)
 *
 * Does NOT retry on other 4xx — those mean the resource genuinely isn't
 * there (e.g. a cardId the CDN doesn't ship), so retrying just delays
 * the caller's normal fallback path.
 */
async function fetchWithRetry(
  url: string,
  fetchImpl: typeof fetch,
  attempts = 3,
  baseDelayMs = 250,
): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response: Response | null = null;
    try {
      response = await fetchImpl(url);
    } catch (e) {
      lastError = e;
    }
    if (response) {
      if (response.ok) return response;
      if (!isRetryableStatus(response.status)) return response;
      lastError = new Error(`HTTP ${response.status}`);
    }
    if (attempt < attempts - 1) {
      await delay(baseDelayMs * (1 << attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function isRetryableStatus(status: number): boolean {
  if (status >= 500) return true;
  return status === 408 || status === 429;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  markFileExists(filePath, true);
}

// ── In-flight download deduplication ────────────────────────────────────
// Multiple overlay panels can request the same cardId simultaneously.
// Without dedup each concurrent request spawns its own HTTP fetch; the
// first response is written to disk and the rest overwrite it. A simple
// Promise-map collapses them into a single download.
const imageDownloadInFlight = new Map<string, Promise<CachedCardImage>>();
const tileDownloadInFlight = new Map<string, Promise<CachedCardTile>>();

function imageDedupKey(cardId: string, options: EnsureCardImageCachedOptions): string {
  const primaryLocale = options.primaryLocale ?? CARD_IMAGE_PRIMARY_LOCALE;
  const fallbackLocale = options.fallbackLocale ?? CARD_IMAGE_FALLBACK_LOCALE;
  const size = options.size ?? CARD_IMAGE_SIZE;
  return `${options.root}:${cardId}:${primaryLocale}:${fallbackLocale}:${size}:${options.force ?? false}`;
}

function tileDedupKey(cardId: string, options: EnsureCardTileCachedOptions): string {
  return `${options.root}:${cardId}:${options.force ?? false}`;
}

export async function ensureCardImageCached(
  cardId: string,
  options: EnsureCardImageCachedOptions,
): Promise<CachedCardImage> {
  assertValidCardId(cardId);
  const primaryLocale = options.primaryLocale ?? CARD_IMAGE_PRIMARY_LOCALE;
  const fallbackLocale = options.fallbackLocale ?? CARD_IMAGE_FALLBACK_LOCALE;
  const size = options.size ?? CARD_IMAGE_SIZE;

  // Fast path: already on disk (uses the memory existence cache).
  const primary = cacheEntry(options.root, primaryLocale, size, cardId);
  if (!options.force && await fileExists(primary.path)) return primary;

  const fallback = cacheEntry(options.root, fallbackLocale, size, cardId);
  if (!options.force && await fileExists(fallback.path)) return fallback;

  // Deduplicate concurrent downloads for the same card + options.
  const key = imageDedupKey(cardId, options);
  const existing = imageDownloadInFlight.get(key);
  if (existing) return existing;

  const promise = downloadCardImage(cardId, options, primary, fallback);
  imageDownloadInFlight.set(key, promise);
  promise.then(
    () => { imageDownloadInFlight.delete(key); },
    () => { imageDownloadInFlight.delete(key); },
  );
  return promise;
}

async function downloadCardImage(
  cardId: string,
  options: EnsureCardImageCachedOptions,
  primary: CachedCardImage,
  fallback: CachedCardImage,
): Promise<CachedCardImage> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  const primaryResponse = await fetchWithRetry(
    buildRemoteCardImageUrl(cardId, primary.locale, primary.size),
    fetchImpl,
  );
  if (primaryResponse.ok) {
    await writeResponse(primary.path, primaryResponse);
    return primary;
  }

  const fallbackResponse = await fetchWithRetry(
    buildRemoteCardImageUrl(cardId, fallback.locale, fallback.size),
    fetchImpl,
  );
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

// ── In-memory file-existence cache ──────────────────────────────────────
const fileExistenceCache = new Map<string, boolean>();

function fileExistsCached(filePath: string): boolean | undefined {
  return fileExistenceCache.get(filePath);
}

function markFileExists(filePath: string, exists: boolean): void {
  fileExistenceCache.set(filePath, exists);
}

/** Clear the entire file-existence cache. Called after LRU sweep. */
export function clearFileExistenceCache(): void {
  fileExistenceCache.clear();
}

async function statFile(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  const cached = fileExistsCached(filePath);
  if (cached !== undefined) return cached;
  const result = await statFile(filePath);
  markFileExists(filePath, result);
  return result;
}

async function writeResponse(filePath: string, response: Response): Promise<void> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, bytes);
  await rename(tempPath, filePath);
  markFileExists(filePath, true);
}

// ── In-memory image cache (protocol layer) ────────────────────────────

interface CachedImageEntry {
  buffer: Buffer;
  contentType: string;
}

export interface InMemoryCacheOptions {
  maxEntries?: number;
  maxBytes?: number;
}

/**
 * LRU memory cache for protocol-handler reads. Chromium does not cache
 * custom-scheme responses (hdt-card-image://), so every <img> paint
 * re-reads from disk without this layer.
 */
export class InMemoryImageCache {
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private cache = new Map<string, CachedImageEntry>();

  constructor(options: InMemoryCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 200;
    this.maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
  }

  get(url: string): CachedImageEntry | undefined {
    const entry = this.cache.get(url);
    if (entry === undefined) return undefined;
    this.cache.delete(url);
    this.cache.set(url, entry);
    return entry;
  }

  set(url: string, entry: CachedImageEntry): void {
    if (entry.buffer.length > this.maxBytes) return;
    const existing = this.cache.get(url);
    if (existing !== undefined) this.cache.delete(url);
    while (this.cache.size >= this.maxEntries || this.sizeInBytes() + entry.buffer.length > this.maxBytes) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey === undefined) break;
      this.cache.delete(firstKey);
    }
    this.cache.set(url, entry);
  }

  clear(): void {
    this.cache.clear();
  }

  stats(): { entries: number; bytes: number } {
    return { entries: this.cache.size, bytes: this.sizeInBytes() };
  }

  private sizeInBytes(): number {
    let sum = 0;
    for (const e of this.cache.values()) sum += e.buffer.length;
    return sum;
  }
}

export function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}
