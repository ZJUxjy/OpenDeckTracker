import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PNG } from 'pngjs';
import {
  cardImageCachePath,
  cardImageCachePathFromUrl,
  cardTileCachePath,
  cardTileCacheUrl,
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

    expect(path.relative(root, resolved)).toBe(path.join('tiles', 'CS2_029.png'));
    expect(path.resolve(resolved).startsWith(path.resolve(root))).toBe(true);
  });

  it('rejects tile path traversal card ids', async () => {
    const root = await createTempRoot();
    expect(() => cardTileCachePath({ root, cardId: '../secret' })).toThrow(/invalid cardId/i);
  });

  it('cardTileCacheUrl returns a tile-protocol URL', () => {
    expect(cardTileCacheUrl({ cardId: 'CS2_029' })).toBe('hdt-card-image://tile/CS2_029.png');
  });

  it('cardImageCachePathFromUrl resolves tile URLs to the tiles/ subdirectory', async () => {
    const root = await createTempRoot();
    const url = cardTileCacheUrl({ cardId: 'CS2_029' });
    const resolved = cardImageCachePathFromUrl(url, root);
    expect(path.relative(root, resolved)).toBe(path.join('tiles', 'CS2_029.png'));
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

  it('throws when the CDN tile fetch fails', async () => {
    const root = await createTempRoot();
    const fetchMock = vi.fn(async () => pngResponse(404));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureCardTileCached('NONEXISTENT_CARD', { root })).rejects.toThrow(/failed to download/i);
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
