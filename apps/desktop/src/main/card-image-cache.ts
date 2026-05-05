import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const CARD_IMAGE_PRIMARY_LOCALE = 'zhCN';
export const CARD_IMAGE_FALLBACK_LOCALE = 'enUS';
export const CARD_IMAGE_SIZE = '256x';
export const CARD_IMAGE_PROTOCOL = 'hdt-card-image';
export const CARD_IMAGE_BASE_URL = 'https://art.hearthstonejson.com/v1/render/latest';
export const CARD_TILE_BASE_URL = 'https://art.hearthstonejson.com/v1/tiles';

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

  // Tile URL: hdt-card-image://tile/<cardId>.png
  if (parsed.hostname === 'tile') {
    const parts = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts.length !== 1) {
      throw new Error('invalid card tile cache URL');
    }
    const fileName = parts[0]!;
    if (!fileName.endsWith('.png')) {
      throw new Error('invalid card tile cache URL');
    }
    const cardId = fileName.slice(0, -'.png'.length);
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
  const resolved = path.resolve(rootPath, 'tiles', `${cardId}.png`);
  const relative = path.relative(rootPath, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('invalid cache path outside card image root');
  }
  return resolved;
}

export function cardTileCacheUrl({ cardId }: { cardId: string }): string {
  assertValidCardId(cardId);
  return `${CARD_IMAGE_PROTOCOL}://tile/${cardId}.png`;
}

export function buildRemoteCardTileUrl(cardId: string): string {
  assertValidCardId(cardId);
  return `${CARD_TILE_BASE_URL}/${cardId}.png`;
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
  await writeResponse(tilePath, response);

  return { cardId, path: tilePath, url: tileUrl };
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
