import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PNG } from 'pngjs';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import {
  cardImageCachePath,
  cardImageCachePathFromUrl,
  cardTileCachePath,
  cardTileCacheUrl,
  cleanLegacyTileCacheDirs,
  enforceCardImageCacheCap,
  ensureCardImageCached,
  ensureCardTileCached,
  trimWhiteBorders,
} from './card-image-cache';

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'hdt-card-images-'));
  tempRoots.push(root);
  return root;
}

function pngResponse(status = 200): Response {
  return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
    status,
    headers: { 'content-type': 'image/png' },
  });
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('card image cache', () => {
  it('resolves cache paths under locale and size directories', async () => {
    const root = await createTempRoot();

    const resolved = cardImageCachePath({
      root,
      locale: 'zhCN',
      size: '256x',
      cardId: 'CS2_029',
    });

    expect(path.relative(root, resolved)).toBe(path.join('zhCN', '256x', 'CS2_029.png'));
    expect(path.resolve(resolved).startsWith(path.resolve(root))).toBe(true);
  });

  it('rejects path traversal card ids', async () => {
    const root = await createTempRoot();

    expect(() =>
      cardImageCachePath({
        root,
        locale: 'zhCN',
        size: '256x',
        cardId: '../secret',
      }),
    ).toThrow(/invalid cardId/i);
  });

  it('downloads an image once and returns the cached local URL on later requests', async () => {
    const root = await createTempRoot();
    const fetchMock = vi.fn(async () => pngResponse());
    vi.stubGlobal('fetch', fetchMock);

    const first = await ensureCardImageCached('CS2_029', { root });
    const second = await ensureCardImageCached('CS2_029', { root });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.url).toBe(first.url);
    expect(first.url).toMatch(/^hdt-card-image:\/\//);
    await expect(stat(first.path)).resolves.toMatchObject({ isFile: expect.any(Function) });
  });

  it('falls back to enUS when the primary zhCN image is missing', async () => {
    const root = await createTempRoot();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pngResponse(404))
      .mockResolvedValueOnce(pngResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    const cached = await ensureCardImageCached('CS2_029', { root });

    expect(cached.locale).toBe('enUS');
    expect(cached.url).toContain('/enUS/256x/CS2_029.png');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('card tile cache', () => {
  it('resolves tile cache paths under a tiles/ subdirectory', async () => {
    const root = await createTempRoot();

    const resolved = cardTileCachePath({ root, cardId: 'CS2_029' });

    expect(path.relative(root, resolved)).toBe(path.join('tiles-v2', 'CS2_029.png'));
    expect(path.resolve(resolved).startsWith(path.resolve(root))).toBe(true);
  });

  it('rejects tile path traversal card ids', async () => {
    const root = await createTempRoot();
    expect(() => cardTileCachePath({ root, cardId: '../secret' })).toThrow(/invalid cardId/i);
  });

  it('cardTileCacheUrl returns a tile-protocol URL', () => {
    expect(cardTileCacheUrl({ cardId: 'CS2_029' })).toBe('hdt-card-image://tile/CS2_029.png');
  });

  it('cardImageCachePathFromUrl resolves tile URLs to the versioned tiles-v2/ subdirectory', async () => {
    const root = await createTempRoot();
    const url = cardTileCacheUrl({ cardId: 'CS2_029' });
    const resolved = cardImageCachePathFromUrl(url, root);
    expect(path.relative(root, resolved)).toBe(path.join('tiles-v2', 'CS2_029.png'));
  });

  it('downloads a tile once and returns the cached local URL on later requests', async () => {
    const root = await createTempRoot();
    const fetchMock = vi.fn(async () => pngResponse());
    vi.stubGlobal('fetch', fetchMock);

    const first = await ensureCardTileCached('CS2_029', { root });
    const second = await ensureCardTileCached('CS2_029', { root });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.url).toBe('hdt-card-image://tile/CS2_029.png');
    expect(second.url).toBe(first.url);
    await expect(stat(first.path)).resolves.toMatchObject({ isFile: expect.any(Function) });
  });

  it('throws when the CDN tile fetch fails with a non-retryable status', async () => {
    const root = await createTempRoot();
    const fetchMock = vi.fn(async () => pngResponse(404));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureCardTileCached('NONEXISTENT_CARD', { root })).rejects.toThrow(/failed to download/i);
    // 404 is treated as the resource genuinely not existing — no retries.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries transient 5xx tile fetches and succeeds on a later attempt', async () => {
    const root = await createTempRoot();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pngResponse(503))
      .mockResolvedValueOnce(pngResponse(503))
      .mockResolvedValueOnce(pngResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    const cached = await ensureCardTileCached('CS2_029', { root });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(cached.url).toBe('hdt-card-image://tile/CS2_029.png');
  });

  it('retries network errors before giving up', async () => {
    const root = await createTempRoot();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(pngResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    const cached = await ensureCardTileCached('CS2_029', { root });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cached.url).toBe('hdt-card-image://tile/CS2_029.png');
  });

  it('hits the CDN exactly once per cardId via the URL builder', async () => {
    const root = await createTempRoot();
    const fetchMock = vi.fn(async () => pngResponse());
    vi.stubGlobal('fetch', fetchMock);

    await ensureCardTileCached('CS2_029', { root, fetchImpl: fetchMock as typeof fetch });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://art.hearthstonejson.com/v1/orig/CS2_029.png',
    );
  });

  it('trims the white border from downloaded tiles before saving', async () => {
    const root = await createTempRoot();
    // 100x100 PNG: 20px white border on left+right, colored center.
    const png = makeBorderedPng(100, 100, { left: 20, right: 20, top: 0, bottom: 0 });
    const fetchMock = vi.fn(async () => new Response(new Uint8Array(png), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }));

    await ensureCardTileCached('CS2_029', {
      root,
      fetchImpl: fetchMock as typeof fetch,
    });

    const tilePath = cardTileCachePath({ root, cardId: 'CS2_029' });
    const fs = await import('node:fs/promises');
    const cachedBytes = await fs.readFile(tilePath);
    const cachedPng = PNG.sync.read(cachedBytes);
    expect(cachedPng.width).toBe(60); // 100 - 20 - 20
    expect(cachedPng.height).toBe(100);
  });
});

describe('cleanLegacyTileCacheDirs', () => {
  it('removes the unversioned tiles/ baseline directory', async () => {
    const root = await createTempRoot();
    await mkdir(path.join(root, 'tiles'), { recursive: true });
    await writeFile(path.join(root, 'tiles', 'CS2_029.png'), Buffer.from([1, 2, 3]));

    const removed = await cleanLegacyTileCacheDirs(root);

    expect(removed).toContain('tiles');
    const remaining = (await readdir(root)).sort();
    expect(remaining).not.toContain('tiles');
  });

  it('removes older tiles-v1/ versioned directories', async () => {
    const root = await createTempRoot();
    await mkdir(path.join(root, 'tiles-v1'), { recursive: true });
    await writeFile(path.join(root, 'tiles-v1', 'CS2_029.png'), Buffer.from([1, 2, 3]));

    const removed = await cleanLegacyTileCacheDirs(root);

    expect(removed).toContain('tiles-v1');
  });

  it('preserves the current tiles-v2/ directory and unrelated siblings', async () => {
    const root = await createTempRoot();
    await mkdir(path.join(root, 'tiles-v2'), { recursive: true });
    await writeFile(path.join(root, 'tiles-v2', 'CS2_029.png'), Buffer.from([1, 2, 3]));
    await mkdir(path.join(root, 'zhCN'), { recursive: true }); // render cache lives here
    await writeFile(path.join(root, 'zhCN', 'placeholder'), Buffer.from([0]));

    const removed = await cleanLegacyTileCacheDirs(root);

    expect(removed).not.toContain('tiles-v2');
    expect(removed).not.toContain('zhCN');
    const remaining = (await readdir(root)).sort();
    expect(remaining).toContain('tiles-v2');
    expect(remaining).toContain('zhCN');
  });

  it('returns an empty list when the root does not exist yet', async () => {
    const removed = await cleanLegacyTileCacheDirs(path.join('does', 'not', 'exist'));
    expect(removed).toEqual([]);
  });
});

describe('enforceCardImageCacheCap', () => {
  async function writeImage(filePath: string, bytes: number, mtimeMs: number): Promise<void> {
    const fs = await import('node:fs/promises');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.alloc(bytes, 'x'));
    await fs.utimes(filePath, new Date(mtimeMs), new Date(mtimeMs));
  }

  it('returns 0/0 when total cache size is below the cap', async () => {
    const root = await createTempRoot();
    await writeImage(path.join(root, 'tiles-v2', 'A.png'), 1000, Date.now());

    const result = await enforceCardImageCacheCap(root, 10_000);
    expect(result).toEqual({ freedBytes: 0, removedCount: 0 });
  });

  it('evicts oldest files first until total drops at or below the cap', async () => {
    const root = await createTempRoot();
    const now = Date.now();
    // Three files: oldest A (5000B, mtime 1000), middle B (3000B, mtime 2000),
    // newest C (4000B, mtime 3000). Total = 12000. Cap = 8000.
    // Expected: evict A (oldest) → remaining = 7000 ≤ cap.
    await writeImage(path.join(root, 'tiles-v2', 'A.png'), 5000, now - 3000);
    await writeImage(path.join(root, 'tiles-v2', 'B.png'), 3000, now - 2000);
    await writeImage(path.join(root, 'tiles-v2', 'C.png'), 4000, now - 1000);

    const result = await enforceCardImageCacheCap(root, 8000);
    expect(result.removedCount).toBe(1);
    expect(result.freedBytes).toBe(5000);

    const fs = await import('node:fs/promises');
    await expect(fs.stat(path.join(root, 'tiles-v2', 'A.png'))).rejects.toThrow();
    await expect(fs.stat(path.join(root, 'tiles-v2', 'B.png'))).resolves.toBeDefined();
    await expect(fs.stat(path.join(root, 'tiles-v2', 'C.png'))).resolves.toBeDefined();
  });

  it('walks both tiles-v2/ and per-locale render subdirs', async () => {
    const root = await createTempRoot();
    const now = Date.now();
    // 1 tile + 1 render. Both should count toward the cap.
    await writeImage(path.join(root, 'tiles-v2', 'tile.png'), 6000, now - 2000);
    await writeImage(path.join(root, 'zhCN', '256x', 'render.png'), 6000, now - 1000);
    // Cap = 8000. Total = 12000. Oldest = tile.png. Evict it.
    const result = await enforceCardImageCacheCap(root, 8000);
    expect(result.removedCount).toBe(1);

    const fs = await import('node:fs/promises');
    await expect(fs.stat(path.join(root, 'tiles-v2', 'tile.png'))).rejects.toThrow();
    await expect(fs.stat(path.join(root, 'zhCN', '256x', 'render.png'))).resolves.toBeDefined();
  });

  it('ignores non-image files (does not delete the .openspec scratch or stray .json)', async () => {
    const root = await createTempRoot();
    const fs = await import('node:fs/promises');
    await fs.mkdir(path.join(root, 'tiles-v2'), { recursive: true });
    await fs.writeFile(path.join(root, 'tiles-v2', 'index.json'), 'meta');
    await writeImage(path.join(root, 'tiles-v2', 'big.png'), 100_000, Date.now() - 1000);

    const result = await enforceCardImageCacheCap(root, 50_000);

    expect(result.removedCount).toBe(1);
    await expect(fs.stat(path.join(root, 'tiles-v2', 'index.json'))).resolves.toBeDefined();
  });

  it('returns 0/0 when the cache root does not exist', async () => {
    const result = await enforceCardImageCacheCap(
      path.join('does', 'not', 'exist'),
      1000,
    );
    expect(result).toEqual({ freedBytes: 0, removedCount: 0 });
  });
});

describe('trimWhiteBorders', () => {
  it('strips left + right white borders precisely', () => {
    const input = makeBorderedPng(100, 100, { left: 25, right: 15, top: 0, bottom: 0 });
    const output = trimWhiteBorders(input);
    const png = PNG.sync.read(output);
    expect(png.width).toBe(60); // 100 - 25 - 15
    expect(png.height).toBe(100);
  });

  it('strips top + bottom white borders precisely', () => {
    const input = makeBorderedPng(100, 100, { left: 0, right: 0, top: 12, bottom: 8 });
    const output = trimWhiteBorders(input);
    const png = PNG.sync.read(output);
    expect(png.width).toBe(100);
    expect(png.height).toBe(80); // 100 - 12 - 8
  });

  it('returns the input unchanged when there is no border', () => {
    const input = makeBorderedPng(100, 100, { left: 0, right: 0, top: 0, bottom: 0 });
    const output = trimWhiteBorders(input);
    // Re-encoding a no-border PNG should produce identical decoded dimensions.
    const png = PNG.sync.read(output);
    expect(png.width).toBe(100);
    expect(png.height).toBe(100);
  });

  it('falls back to the original buffer when the input is not a valid PNG', () => {
    const garbage = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    const output = trimWhiteBorders(garbage);
    expect(output).toBe(garbage);
  });

  it('does not crop when the would-be result is below half the original dimension', () => {
    // 100x100 PNG with a 60-pixel-wide white block in the middle but real
    // content on the left and right edges — naive trim would not be
    // triggered (no edge is fully white), so this test mainly verifies
    // a far edgier case: a 100x100 image with white on >50% of left side.
    const input = makeBorderedPng(100, 100, { left: 60, right: 0, top: 0, bottom: 0 });
    const output = trimWhiteBorders(input);
    const png = PNG.sync.read(output);
    // 100 - 60 = 40 < 50 (half) → fallback to original
    expect(png.width).toBe(100);
    expect(png.height).toBe(100);
  });
});

/**
 * Build a PNG with all-white borders on the requested sides and a solid
 * non-white color in the centered remainder. Returns a PNG-encoded buffer.
 */
function makeBorderedPng(
  width: number,
  height: number,
  border: { left: number; right: number; top: number; bottom: number },
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const inBorder =
        x < border.left ||
        x >= width - border.right ||
        y < border.top ||
        y >= height - border.bottom;
      if (inBorder) {
        png.data[idx] = 255;
        png.data[idx + 1] = 255;
        png.data[idx + 2] = 255;
      } else {
        // Solid red center — clearly non-white, well below threshold.
        png.data[idx] = 200;
        png.data[idx + 1] = 50;
        png.data[idx + 2] = 50;
      }
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}
