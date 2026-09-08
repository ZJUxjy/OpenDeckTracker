import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkLatestCardRelease, prepareCardRelease } from './card-data-release';

const folders: string[] = [];
afterEach(async () => { for (const folder of folders.splice(0)) await fs.rm(folder, { recursive: true, force: true }); });
const release = { commit: 'a'.repeat(40), version: '1.0.0.240818', build: '240818' };
describe('verified card releases', () => {
  it('pins README and XML to the resolved commit', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ sha: release.commit })))
      .mockResolvedValueOnce(new Response(`Version: ${release.version}`));
    expect(await checkLatestCardRelease(fetcher)).toEqual(release);
    expect(fetcher.mock.calls[1]?.[0]).toContain(`/${release.commit}/README.md`);
  });
  it('rejects checksum and build mismatches before publication', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hdt-release-')); folders.push(dir);
    const bytes = await fs.readFile('packages/hearthdb/src/tests/fixtures/hsdata-mini.xml');
    const fetcher = vi.fn(async () => new Response(bytes));
    await expect(prepareCardRelease({ ...release, sha256: '0'.repeat(64) }, dir, fetcher)).rejects.toThrow('checksum');
    await expect(fs.access(path.join(dir, 'generated'))).rejects.toThrow();
    await expect(prepareCardRelease({ ...release, version: '1.0.0.1', build: '1' }, dir, fetcher)).rejects.toThrow('validation');
  });
});
