import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadCardImagesForTest } from './download-card-images';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'hdt-card-images-script-'));
  tempDirs.push(dir);
  return dir;
}

async function writeCards(dir: string, ids: string[]): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'cards.collectible.zhCN.json');
  await writeFile(
    file,
    JSON.stringify(ids.map((id) => ({ id, name: id, collectible: true }))),
    'utf8',
  );
  return file;
}

function pngResponse(): Response {
  return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('downloadCardImagesForTest', () => {
  it('downloads images listed in generated card JSON', async () => {
    const root = await makeTempDir();
    const cardsFile = await writeCards(path.join(root, 'generated'), ['CS2_029']);
    const cacheRoot = path.join(root, 'cache');
    const fetchMock = vi.fn(async () => pngResponse());

    const result = await downloadCardImagesForTest({
      cardsFile,
      cacheRoot,
      fetchImpl: fetchMock,
    });

    expect(result).toMatchObject({
      total: 1,
      downloaded: 1,
      skipped: 0,
      failed: 0,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const bytes = await readFile(path.join(cacheRoot, 'zhCN', '256x', 'CS2_029.png'));
    expect([...bytes]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('skips existing files unless force mode is enabled', async () => {
    const root = await makeTempDir();
    const cardsFile = await writeCards(path.join(root, 'generated'), ['CS2_029']);
    const cacheRoot = path.join(root, 'cache');
    await mkdir(path.join(cacheRoot, 'zhCN', '256x'), { recursive: true });
    await writeFile(path.join(cacheRoot, 'zhCN', '256x', 'CS2_029.png'), 'old');
    const fetchMock = vi.fn(async () => pngResponse());

    const skipped = await downloadCardImagesForTest({
      cardsFile,
      cacheRoot,
      fetchImpl: fetchMock,
    });
    const forced = await downloadCardImagesForTest({
      cardsFile,
      cacheRoot,
      fetchImpl: fetchMock,
      force: true,
    });

    expect(skipped).toMatchObject({ total: 1, downloaded: 0, skipped: 1, failed: 0 });
    expect(forced).toMatchObject({ total: 1, downloaded: 1, skipped: 0, failed: 0 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
