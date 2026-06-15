import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardImageBulkDownloadOrchestrator } from './orchestrator';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'hdt-orch-'));
  tempDirs.push(dir);
  return dir;
}

function pngResponse(): Response {
  return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.doUnmock('node:fs/promises');
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function writeCardsJson(dir: string, ids: string[]): Promise<string> {
  const file = path.join(dir, 'cards.collectible.zhCN.json');
  await writeFile(
    file,
    JSON.stringify(ids.map((id) => ({ id, name: id, collectible: true }))),
    'utf8',
  );
  return file;
}

describe('CardImageBulkDownloadOrchestrator', () => {
  it('downloads all requested types and reports completed', async () => {
    const root = await makeTempDir();
    await writeCardsJson(root, ['CS2_029']);
    const cacheRoot = path.join(root, 'cache');
    const fetchMock = vi.fn(async () => pngResponse());

    const orchestrator = new CardImageBulkDownloadOrchestrator({
      cacheRoot,
      getCardIds: async () => ['CS2_029'],
      fetchImpl: fetchMock,
    });

    const progressEvents: unknown[] = [];
    const result = await orchestrator.start(['render'], (status) => progressEvents.push(status));

    expect(result.ok).toBe(true);
    const status = result.ok ? result.status : null;
    expect(status?.state).toBe('completed');
    expect(status?.progress.completed).toBe(1);
    expect(status?.progress.total).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips files already on disk', async () => {
    const root = await makeTempDir();
    const cacheRoot = path.join(root, 'cache');
    await mkdir(path.join(cacheRoot, 'zhCN', '256x'), { recursive: true });
    await writeFile(path.join(cacheRoot, 'zhCN', '256x', 'CS2_029.png'), 'existing');
    const fetchMock = vi.fn(async () => pngResponse());

    const orchestrator = new CardImageBulkDownloadOrchestrator({
      cacheRoot,
      getCardIds: async () => ['CS2_029'],
      fetchImpl: fetchMock,
    });

    const result = await orchestrator.start(['render']);
    expect(result.ok).toBe(true);
    expect(result.ok && result.status.stats.skippedRenders).toBe(1);
    expect(result.ok && result.status.stats.downloadedRenders).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects start when already running', async () => {
    const root = await makeTempDir();
    const cacheRoot = path.join(root, 'cache');
    const orchestrator = new CardImageBulkDownloadOrchestrator({
      cacheRoot,
      getCardIds: async () => ['CS2_029'],
      fetchImpl: vi.fn(async () => pngResponse()),
    });

    const first = orchestrator.start(['render']);
    const second = orchestrator.start(['render']);
    const [r1, r2] = await Promise.all([first, second]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    expect(r2.ok === false && r2.error).toBe('already-running');
  });

  it('pauses and resumes from progress file', async () => {
    const root = await makeTempDir();
    const cacheRoot = path.join(root, 'cache');
    let fetchCount = 0;
    const fetchMock = vi.fn(async () => {
      fetchCount++;
      return pngResponse();
    });

    const orchestrator = new CardImageBulkDownloadOrchestrator({
      cacheRoot,
      getCardIds: async () => ['CS2_029', 'EX1_277'],
      fetchImpl: fetchMock,
      persistIntervalCards: 1,
    });

    const startPromise = orchestrator.start(['render']);
    orchestrator.pause();
    const pausedResult = await startPromise;
    expect(pausedResult.ok).toBe(true);
    expect(pausedResult.ok && pausedResult.status.state).toBe('paused');

    const fetchedBeforeResume = fetchCount;
    expect(fetchedBeforeResume).toBeGreaterThanOrEqual(0);
    expect(fetchedBeforeResume).toBeLessThan(2);

    const resumedOrchestrator = new CardImageBulkDownloadOrchestrator({
      cacheRoot,
      getCardIds: async () => ['CS2_029', 'EX1_277'],
      fetchImpl: fetchMock,
      persistIntervalCards: 1,
    });
    const resumedResult = await resumedOrchestrator.resume();
    expect(resumedResult.ok).toBe(true);
    expect(resumedResult.ok && resumedResult.status.state).toBe('completed');
    expect(fetchCount).toBe(2);
  });

  it('retries failed cards on resume and records them', async () => {
    const root = await makeTempDir();
    const cacheRoot = path.join(root, 'cache');
    const fetchMock = vi.fn(async () => new Response(null, { status: 410 }));

    const orchestrator = new CardImageBulkDownloadOrchestrator({
      cacheRoot,
      getCardIds: async () => ['CS2_029'],
      fetchImpl: fetchMock,
      persistIntervalCards: 1,
    });

    const first = await orchestrator.start(['render']);
    expect(first.ok).toBe(true);
    expect(first.ok && first.status.state).toBe('completed-with-errors');
    expect(first.ok && first.status.stats.failed).toBe(1);

    const fetchMockRetry = vi.fn(async () => pngResponse());
    const resumed = new CardImageBulkDownloadOrchestrator({
      cacheRoot,
      getCardIds: async () => ['CS2_029'],
      fetchImpl: fetchMockRetry,
      persistIntervalCards: 1,
    });
    const second = await resumed.resume();
    expect(second.ok).toBe(true);
    expect(second.ok && second.status.state).toBe('completed');
    expect(second.ok && second.status.stats.failed).toBe(1);
  });

  it('refuses to start when disk space is insufficient', async () => {
    const root = await makeTempDir();
    const cacheRoot = path.join(root, 'cache');
    const orchestrator = new CardImageBulkDownloadOrchestrator({
      cacheRoot,
      getCardIds: async () => ['CS2_029'],
      fetchImpl: vi.fn(async () => pngResponse()),
    });

    vi.doMock('node:fs/promises', async (importOriginal) => {
      const actual = (await importOriginal()) as typeof import('node:fs/promises');
      return {
        ...actual,
        statfs: vi.fn(async () => ({ bavail: 1, bsize: 1 })),
      };
    });

    const result = await orchestrator.start(['render', 'tile']);

    vi.doUnmock('node:fs/promises');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe('insufficient-disk-space');
  });
});
