import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type BulkDownloadProgress,
  BULK_DOWNLOAD_PROGRESS_SCHEMA_VERSION,
} from './index';
import { loadProgress, saveProgress } from './storage';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'hdt-bulk-dl-'));
  tempDirs.push(dir);
  return dir;
}

function makeProgress(overrides?: Partial<BulkDownloadProgress>): BulkDownloadProgress {
  return {
    schemaVersion: BULK_DOWNLOAD_PROGRESS_SCHEMA_VERSION,
    startedAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:01.000Z',
    cardIds: ['CS2_029', 'EX1_277'],
    completedCardIds: ['CS2_029'],
    failedCardIds: [],
    paused: false,
    types: ['render'],
    stats: {
      downloadedRenders: 1,
      downloadedTiles: 0,
      skippedRenders: 0,
      skippedTiles: 0,
      failed: 0,
    },
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('loadProgress', () => {
  it('returns null when the file is missing', async () => {
    const dir = await makeTempDir();
    await expect(loadProgress(dir)).resolves.toBeNull();
  });

  it('loads a valid progress file', async () => {
    const dir = await makeTempDir();
    const expected = makeProgress();
    await saveProgress(dir, expected);
    const loaded = await loadProgress(dir);
    expect(loaded).toEqual(expected);
  });

  it('returns null for malformed JSON', async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, 'bulk-download-progress.json'), 'not json');
    await expect(loadProgress(dir)).resolves.toBeNull();
  });

  it('returns null when schema version is unsupported', async () => {
    const dir = await makeTempDir();
    await writeFile(
      path.join(dir, 'bulk-download-progress.json'),
      JSON.stringify({ schemaVersion: 999 }),
    );
    await expect(loadProgress(dir)).resolves.toBeNull();
  });

  it('returns null when required fields are missing', async () => {
    const dir = await makeTempDir();
    await writeFile(
      path.join(dir, 'bulk-download-progress.json'),
      JSON.stringify({ schemaVersion: 1, cardIds: [] }),
    );
    await expect(loadProgress(dir)).resolves.toBeNull();
  });
});

describe('loadProgress validation', () => {
  it('returns null for invalid types value', async () => {
    const dir = await makeTempDir();
    const progress = makeProgress({ types: ['render', 'invalid'] as unknown as ('render' | 'tile')[] });
    await writeFile(path.join(dir, 'bulk-download-progress.json'), JSON.stringify(progress));
    await expect(loadProgress(dir)).resolves.toBeNull();
  });

  it('returns null when paused is not boolean', async () => {
    const dir = await makeTempDir();
    const progress = makeProgress({ paused: 'false' as unknown as boolean });
    await writeFile(path.join(dir, 'bulk-download-progress.json'), JSON.stringify(progress));
    await expect(loadProgress(dir)).resolves.toBeNull();
  });

  it('returns null when stats contains negative number', async () => {
    const dir = await makeTempDir();
    const progress = makeProgress({ stats: { ...makeProgress().stats, failed: -1 } });
    await writeFile(path.join(dir, 'bulk-download-progress.json'), JSON.stringify(progress));
    await expect(loadProgress(dir)).resolves.toBeNull();
  });

  it('returns null when stats contains NaN', async () => {
    const dir = await makeTempDir();
    const progress = makeProgress({ stats: { ...makeProgress().stats, failed: NaN } });
    await writeFile(path.join(dir, 'bulk-download-progress.json'), JSON.stringify(progress));
    await expect(loadProgress(dir)).resolves.toBeNull();
  });

  it('returns null when cardIds contains non-string', async () => {
    const dir = await makeTempDir();
    const progress = makeProgress({ cardIds: [123] as unknown as string[] });
    await writeFile(path.join(dir, 'bulk-download-progress.json'), JSON.stringify(progress));
    await expect(loadProgress(dir)).resolves.toBeNull();
  });

  it('returns null when stoppedAt is a number', async () => {
    const dir = await makeTempDir();
    const progress = makeProgress({ stoppedAt: 123 as unknown as string });
    await writeFile(path.join(dir, 'bulk-download-progress.json'), JSON.stringify(progress));
    await expect(loadProgress(dir)).resolves.toBeNull();
  });

  it('returns null when stats key is missing', async () => {
    const dir = await makeTempDir();
    const progress = makeProgress() as unknown as Record<string, unknown>;
    delete progress['stats'];
    await writeFile(path.join(dir, 'bulk-download-progress.json'), JSON.stringify(progress));
    await expect(loadProgress(dir)).resolves.toBeNull();
  });

  it('returns null when completedCardIds contains non-string', async () => {
    const dir = await makeTempDir();
    const progress = makeProgress({ completedCardIds: [123] as unknown as string[] });
    await writeFile(path.join(dir, 'bulk-download-progress.json'), JSON.stringify(progress));
    await expect(loadProgress(dir)).resolves.toBeNull();
  });

  it('returns null when failedCardIds contains non-string', async () => {
    const dir = await makeTempDir();
    const progress = makeProgress({ failedCardIds: [123] as unknown as string[] });
    await writeFile(path.join(dir, 'bulk-download-progress.json'), JSON.stringify(progress));
    await expect(loadProgress(dir)).resolves.toBeNull();
  });

  it('returns null when startedAt is not a valid date', async () => {
    const dir = await makeTempDir();
    const progress = makeProgress({ startedAt: 'not-a-date' });
    await writeFile(path.join(dir, 'bulk-download-progress.json'), JSON.stringify(progress));
    await expect(loadProgress(dir)).resolves.toBeNull();
  });

  it('returns null when updatedAt is not a valid date', async () => {
    const dir = await makeTempDir();
    const progress = makeProgress({ updatedAt: 'not-a-date' });
    await writeFile(path.join(dir, 'bulk-download-progress.json'), JSON.stringify(progress));
    await expect(loadProgress(dir)).resolves.toBeNull();
  });

  it('returns null when stats is missing a sub-field', async () => {
    const dir = await makeTempDir();
    const stats = { ...makeProgress().stats } as unknown as Record<string, unknown>;
    delete stats['downloadedRenders'];
    const progress = makeProgress({ stats: stats as unknown as BulkDownloadProgress['stats'] });
    await writeFile(path.join(dir, 'bulk-download-progress.json'), JSON.stringify(progress));
    await expect(loadProgress(dir)).resolves.toBeNull();
  });

  it('returns null when types is empty', async () => {
    const dir = await makeTempDir();
    const progress = makeProgress({ types: [] as unknown as ('render' | 'tile')[] });
    await writeFile(path.join(dir, 'bulk-download-progress.json'), JSON.stringify(progress));
    await expect(loadProgress(dir)).resolves.toBeNull();
  });
});

describe('saveProgress', () => {
  it('writes a tmp file and renames atomically', async () => {
    const dir = await makeTempDir();
    const progress = makeProgress();
    await saveProgress(dir, progress);
    const files = await readdir(dir);
    expect(files).toContain('bulk-download-progress.json');
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
    const raw = await readFile(path.join(dir, 'bulk-download-progress.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual(progress);
  });

  it('ignores orphaned tmp file and loads valid progress', async () => {
    const dir = await makeTempDir();
    const expected = makeProgress();
    await writeFile(path.join(dir, 'bulk-download-progress.json.tmp'), JSON.stringify({ invalid: true }));
    await writeFile(path.join(dir, 'bulk-download-progress.json'), JSON.stringify(expected));
    const loaded = await loadProgress(dir);
    expect(loaded).toEqual(expected);
  });

  it('creates nested directories when needed', async () => {
    const dir = await makeTempDir();
    const nested = path.join(dir, 'a', 'b', 'c');
    const progress = makeProgress();
    await saveProgress(nested, progress);
    const loaded = await loadProgress(nested);
    expect(loaded).toEqual(progress);
  });

  it('overwrites an existing progress file', async () => {
    const dir = await makeTempDir();
    const first = makeProgress({ cardIds: ['CS2_029'] });
    const second = makeProgress({ cardIds: ['EX1_277'] });
    await saveProgress(dir, first);
    await saveProgress(dir, second);
    const loaded = await loadProgress(dir);
    expect(loaded).toEqual(second);
  });
});
