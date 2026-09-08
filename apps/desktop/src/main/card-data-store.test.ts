import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CardDataStore } from './card-data-store';

const folders: string[] = [];
afterEach(async () => { for (const folder of folders.splice(0)) await fs.rm(folder, { recursive: true, force: true }); });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hdt-card-store-')); folders.push(root);
  const bundled = path.join(root, 'bundled');
  await fs.mkdir(bundled);
  await fs.writeFile(path.join(bundled, 'card-build.json'), JSON.stringify({ build: 'old', totalCards: 1, collectibleCards: 1 }));
  for (const locale of ['enUS', 'zhCN']) await fs.writeFile(path.join(bundled, `cards.all.${locale}.json`), '[]');
  const bytes = await fs.readFile(path.resolve('packages/hearthdb/src/tests/fixtures/hsdata-mini.xml'));
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    const value = String(url);
    if (value.endsWith('/master')) return new Response(JSON.stringify({ sha: 'a'.repeat(40) }));
    if (value.endsWith('README.md')) return new Response('Version: 1.0.0.240818');
    return new Response(bytes);
  });
  return { root, bundled, fetcher };
}
describe('card data activation', () => {
  it('keeps the running database fixed, activates on restart, and rolls back', async () => {
    const { root, bundled, fetcher } = await fixture();
    const store = new CardDataStore(root, bundled, fetcher);
    const installed = await store.install();
    expect(store.activeDirectory).toBe(bundled);
    expect(installed.active?.build).toBe('old');
    expect(installed.pending?.build).toBe('240818');
    const restarted = new CardDataStore(root, bundled, fetcher);
    expect((await restarted.getStatus()).active?.build).toBe('240818');
    expect((await restarted.rollback()).pending?.build).toBe('old');
    expect(new CardDataStore(root, bundled, fetcher).activeDirectory).toBe(bundled);
  });
  it('preserves the pointer after a failed download and allows retry', async () => {
    const { root, bundled, fetcher } = await fixture();
    const store = new CardDataStore(root, bundled, fetcher);
    await store.check();
    fetcher.mockRejectedValueOnce(new Error('offline'));
    await expect(store.install()).rejects.toThrow('offline');
    expect(await store.getStatus()).toMatchObject({ busy: false, pending: null });
    await expect(fs.access(path.join(root, 'current.json'))).rejects.toThrow();
    expect((await store.install()).pending?.build).toBe('240818');
  });
});
