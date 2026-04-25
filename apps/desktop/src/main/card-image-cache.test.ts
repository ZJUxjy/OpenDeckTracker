import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cardImageCachePath,
  ensureCardImageCached,
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
