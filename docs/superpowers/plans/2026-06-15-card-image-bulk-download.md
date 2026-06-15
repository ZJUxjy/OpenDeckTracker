# Card Image Bulk Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app bulk pre-download service for collectible card images (renders and/or tiles) with pause, resume, abort, persistent progress, and robust error handling.

**Architecture:** Add a new `card-image-download` module under `apps/desktop/src/main/` modeled after `popular-decks-sync`. A single `CardImageBulkDownloadOrchestrator` holds the state machine and download loop, a `storage.ts` module persists progress to JSON, and an `ipc.ts` module wires start/pause/resume/abort/status into Electron IPC. The orchestrator reuses the existing `ensureCardImageCached` / `ensureCardTileCached` functions from `card-image-cache.ts` so retry, atomic write, and on-demand deduplication behavior stay identical.

**Tech Stack:** TypeScript, Vitest, Electron IPC (`ipcMain` + `BrowserWindow.webContents.send`), Node.js `fs/promises`, `AbortController`, `node:fs` disk-space checks.

---

## File Structure

- Create `apps/desktop/src/main/card-image-download/index.ts` — public types and module exports.
- Create `apps/desktop/src/main/card-image-download/storage.ts` — progress JSON load/save/validation.
- Create `apps/desktop/src/main/card-image-download/storage.test.ts` — storage unit tests.
- Create `apps/desktop/src/main/card-image-download/orchestrator.ts` — core orchestrator and state machine.
- Create `apps/desktop/src/main/card-image-download/orchestrator.test.ts` — orchestrator unit tests.
- Create `apps/desktop/src/main/card-image-download/ipc.ts` — IPC registration and progress broadcast.
- Create `apps/desktop/src/main/card-image-download/ipc.test.ts` — IPC handler tests.
- Modify `apps/desktop/src/main/ipc.ts` — construct orchestrator, register IPC, abort on quit.
- Modify `apps/desktop/src/preload/index.ts` — add `cardImages.bulkDownload` API surface (future UI hookup).

---

## Task 1: Public types and module exports

**Files:**
- Create: `apps/desktop/src/main/card-image-download/index.ts`
- Test: `apps/desktop/src/main/card-image-download/index.test.ts`

- [ ] **Step 1: Write the failing type/import test**

Create `apps/desktop/src/main/card-image-download/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  BULK_DOWNLOAD_PROGRESS_SCHEMA_VERSION,
  type BulkDownloadProgress,
  type BulkDownloadState,
  type BulkDownloadStatus,
  type BulkDownloadType,
} from './index';

describe('card-image-download public exports', () => {
  it('exports the schema version constant', () => {
    expect(BULK_DOWNLOAD_PROGRESS_SCHEMA_VERSION).toBe(1);
  });

  it('types compile', () => {
    const progress: BulkDownloadProgress = {
      schemaVersion: BULK_DOWNLOAD_PROGRESS_SCHEMA_VERSION,
      startedAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:00.000Z',
      cardIds: ['CS2_029'],
      completedCardIds: [],
      failedCardIds: [],
      paused: false,
      types: ['render', 'tile'],
      stats: {
        downloadedRenders: 0,
        downloadedTiles: 0,
        skippedRenders: 0,
        skippedTiles: 0,
        failed: 0,
      },
    };
    const status: BulkDownloadStatus = {
      state: 'idle',
      progress: { completed: 0, total: 1, failed: 0, currentCardId: null },
      stats: progress.stats,
    };
    const type: BulkDownloadType = 'render';
    expect(progress.cardIds).toContain('CS2_029');
    expect(status.state).toBe('idle');
    expect(type).toBe('render');
  });
});
```

- [ ] **Step 2: Run the test and expect failure**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/main/card-image-download/index.test.ts
```

Expected: FAIL — module `./index` not found.

- [ ] **Step 3: Create the public types module**

Create `apps/desktop/src/main/card-image-download/index.ts`:

```ts
export const BULK_DOWNLOAD_PROGRESS_SCHEMA_VERSION = 1;

export type BulkDownloadType = 'render' | 'tile';

export interface BulkDownloadStats {
  downloadedRenders: number;
  downloadedTiles: number;
  skippedRenders: number;
  skippedTiles: number;
  failed: number;
}

export interface BulkDownloadProgress {
  schemaVersion: typeof BULK_DOWNLOAD_PROGRESS_SCHEMA_VERSION;
  startedAt: string;
  updatedAt: string;
  cardIds: string[];
  completedCardIds: string[];
  failedCardIds: string[];
  paused: boolean;
  stoppedAt?: string;
  types: BulkDownloadType[];
  stats: BulkDownloadStats;
}

export type BulkDownloadState =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'completed-with-errors'
  | 'failed';

export interface BulkDownloadStatus {
  state: BulkDownloadState;
  progress: {
    completed: number;
    total: number;
    failed: number;
    currentCardId: string | null;
  };
  stats: BulkDownloadStats;
}

export interface StartBulkDownloadResult {
  ok: true;
  status: BulkDownloadStatus;
} | {
  ok: false;
  error: string;
};
```

- [ ] **Step 4: Run the test and expect pass**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/main/card-image-download/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/card-image-download/index.ts apps/desktop/src/main/card-image-download/index.test.ts
git commit -m "feat(card-image-download): add public types and exports"
```

---

## Task 2: Progress persistence (storage.ts)

**Files:**
- Create: `apps/desktop/src/main/card-image-download/storage.ts`
- Create: `apps/desktop/src/main/card-image-download/storage.test.ts`

- [ ] **Step 1: Write failing storage tests**

Create `apps/desktop/src/main/card-image-download/storage.test.ts`:

```ts
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
});
```

- [ ] **Step 2: Run the tests and expect failure**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/main/card-image-download/storage.test.ts
```

Expected: FAIL — `loadProgress` / `saveProgress` not defined.

- [ ] **Step 3: Implement storage.ts**

Create `apps/desktop/src/main/card-image-download/storage.ts`:

```ts
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BULK_DOWNLOAD_PROGRESS_SCHEMA_VERSION,
  type BulkDownloadProgress,
} from './index';

export const PROGRESS_FILENAME = 'bulk-download-progress.json';
export const PROGRESS_TMP_FILENAME = 'bulk-download-progress.json.tmp';

export async function loadProgress(cacheRoot: string): Promise<BulkDownloadProgress | null> {
  const filePath = path.join(cacheRoot, PROGRESS_FILENAME);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isBulkDownloadProgress(parsed)) return null;
  return parsed;
}

export async function saveProgress(
  cacheRoot: string,
  progress: BulkDownloadProgress,
): Promise<void> {
  await mkdir(cacheRoot, { recursive: true });
  const tmpPath = path.join(cacheRoot, PROGRESS_TMP_FILENAME);
  const finalPath = path.join(cacheRoot, PROGRESS_FILENAME);
  await writeFile(tmpPath, JSON.stringify(progress, null, 2), 'utf8');
  await rename(tmpPath, finalPath);
}

function isBulkDownloadProgress(value: unknown): value is BulkDownloadProgress {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v['schemaVersion'] !== BULK_DOWNLOAD_PROGRESS_SCHEMA_VERSION) return false;
  if (typeof v['startedAt'] !== 'string') return false;
  if (typeof v['updatedAt'] !== 'string') return false;
  if (!isStringArray(v['cardIds'])) return false;
  if (!isStringArray(v['completedCardIds'])) return false;
  if (!isStringArray(v['failedCardIds'])) return false;
  if (typeof v['paused'] !== 'boolean') return false;
  if (!isStringArray(v['types'])) return false;
  if (!v['types'].every((t) => t === 'render' || t === 'tile')) return false;
  if (!isStats(v['stats'])) return false;
  return true;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isStats(value: unknown): value is BulkDownloadProgress['stats'] {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s['downloadedRenders'] === 'number' &&
    typeof s['downloadedTiles'] === 'number' &&
    typeof s['skippedRenders'] === 'number' &&
    typeof s['skippedTiles'] === 'number' &&
    typeof s['failed'] === 'number'
  );
}
```

- [ ] **Step 4: Run the tests and expect pass**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/main/card-image-download/storage.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/card-image-download/storage.ts apps/desktop/src/main/card-image-download/storage.test.ts
git commit -m "feat(card-image-download): add progress persistence"
```

---

## Task 3: Orchestrator core (state machine + download loop)

**Files:**
- Create: `apps/desktop/src/main/card-image-download/orchestrator.ts`
- Create: `apps/desktop/src/main/card-image-download/orchestrator.test.ts`

- [ ] **Step 1: Write failing orchestrator tests**

Create `apps/desktop/src/main/card-image-download/orchestrator.test.ts`:

```ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardImageBulkDownloadOrchestrator } from './orchestrator';
import type { BulkDownloadType } from './index';

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
    const cardsFile = await writeCardsJson(root, ['CS2_029']);
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
});
```

- [ ] **Step 2: Run the tests and expect failure**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/main/card-image-download/orchestrator.test.ts
```

Expected: FAIL — `CardImageBulkDownloadOrchestrator` not defined.

- [ ] **Step 3: Implement the orchestrator core**

Create `apps/desktop/src/main/card-image-download/orchestrator.ts`:

```ts
import { ensureCardImageCached, ensureCardTileCached } from '../card-image-cache';
import {
  BULK_DOWNLOAD_PROGRESS_SCHEMA_VERSION,
  type BulkDownloadProgress,
  type BulkDownloadState,
  type BulkDownloadStatus,
  type BulkDownloadType,
  type StartBulkDownloadResult,
} from './index';
import { loadProgress, saveProgress } from './storage';

export interface CardImageBulkDownloadOrchestratorDeps {
  cacheRoot: string;
  getCardIds: () => Promise<string[]>;
  fetchImpl?: typeof fetch;
  concurrency?: number;
  persistIntervalCards?: number;
}

export type BulkDownloadProgressCallback = (status: BulkDownloadStatus) => void;

export class CardImageBulkDownloadOrchestrator {
  private state: BulkDownloadState = 'idle';
  private inFlight = false;
  private currentController: AbortController | null = null;
  private currentCardId: string | null = null;
  private stats: BulkDownloadProgress['stats'] = emptyStats();
  private progress: BulkDownloadProgress | null = null;
  private progressCb: BulkDownloadProgressCallback = () => undefined;

  constructor(private readonly deps: CardImageBulkDownloadOrchestratorDeps) {}

  getStatus(): BulkDownloadStatus {
    return {
      state: this.state,
      progress: {
        completed: this.progress ? this.progress.completedCardIds.length : 0,
        total: this.progress ? this.progress.cardIds.length : 0,
        failed: this.progress ? this.progress.failedCardIds.length : 0,
        currentCardId: this.currentCardId,
      },
      stats: this.progress ? this.progress.stats : emptyStats(),
    };
  }

  async start(
    types: BulkDownloadType[],
    progressCb?: BulkDownloadProgressCallback,
    force = false,
  ): Promise<StartBulkDownloadResult> {
    if (this.inFlight) {
      return { ok: false, error: 'already-running' };
    }

    this.progressCb = progressCb ?? (() => undefined);

    if (force) {
      this.progress = null;
    }

    const loaded = await loadProgress(this.deps.cacheRoot);
    const loadedCoversRequested = loaded && types.every((t) => loaded.types.includes(t));
    if (loaded && !force && loadedCoversRequested) {
      this.progress = loaded;
    }

    if (!this.progress) {
      const cardIds = await this.deps.getCardIds();
      const now = new Date().toISOString();
      this.progress = {
        schemaVersion: BULK_DOWNLOAD_PROGRESS_SCHEMA_VERSION,
        startedAt: now,
        updatedAt: now,
        cardIds: [...cardIds].sort((a, b) => a.localeCompare(b)),
        completedCardIds: [],
        failedCardIds: [],
        paused: false,
        types: [...types],
        stats: emptyStats(),
      };
    }

    this.inFlight = true;
    this.state = 'running';
    this.currentController = new AbortController();
    this.broadcast();

    try {
      return await this.runLoop(this.currentController.signal);
    } finally {
      this.inFlight = false;
      this.currentController = null;
      this.currentCardId = null;
      this.broadcast();
    }
  }

  pause(): void {
    this.currentController?.abort();
  }

  resume(progressCb?: BulkDownloadProgressCallback): Promise<StartBulkDownloadResult> {
    const types = this.progress?.types ?? ['render', 'tile'];
    return this.start(types, progressCb, false);
  }

  abort(): void {
    this.currentController?.abort();
  }

  private async runLoop(signal: AbortSignal): Promise<StartBulkDownloadResult> {
    const progress = this.progress!;
    const pending = progress.cardIds.filter(
      (id) => !progress.completedCardIds.includes(id),
    );

    const concurrency = Math.max(1, this.deps.concurrency ?? 8);
    const persistEvery = Math.max(1, this.deps.persistIntervalCards ?? 10);
    let processedSincePersist = 0;
    let processedSinceDiskCheck = 0;

    try {
      await runWithConcurrency(pending, concurrency, async (cardId) => {
        if (signal.aborted) throw abortError();
        this.currentCardId = cardId;
        this.broadcast();

        const renderResult = progress.types.includes('render')
          ? await this.downloadRender(cardId, signal)
          : 'skip';
        const tileResult = progress.types.includes('tile')
          ? await this.downloadTile(cardId, signal)
          : 'skip';

        if (renderResult === 'success' && tileResult === 'success') {
          addToSet(progress.completedCardIds, cardId);
          removeFromArray(progress.failedCardIds, cardId);
        } else if (renderResult === 'failed' || tileResult === 'failed') {
          addToSet(progress.failedCardIds, cardId);
          progress.stats.failed++;
        } else if (renderResult === 'success' || tileResult === 'success') {
          // One type requested and succeeded.
          addToSet(progress.completedCardIds, cardId);
          removeFromArray(progress.failedCardIds, cardId);
        }

        progress.updatedAt = new Date().toISOString();
        processedSincePersist++;
        if (processedSincePersist >= persistEvery) {
          await this.persist();
          processedSincePersist = 0;
        }

        this.currentCardId = null;
      });
    } catch (e) {
      if (!isAbortError(e)) throw e;
      // Abort means pause; fall through to the paused-state handling below.
    }

    await this.persist();

    if (signal.aborted) {
      progress.paused = true;
      progress.stoppedAt = new Date().toISOString();
      await this.persist();
      this.state = 'paused';
      return { ok: true, status: this.getStatus() };
    }

    this.state = progress.failedCardIds.length > 0 ? 'completed-with-errors' : 'completed';
    return { ok: true, status: this.getStatus() };
  }

  private async downloadRender(cardId: string, signal: AbortSignal): Promise<'success' | 'failed' | 'skip'> {
    try {
      await ensureCardImageCached(cardId, {
        root: this.deps.cacheRoot,
        fetchImpl: this.deps.fetchImpl,
      });
      this.progress!.stats.downloadedRenders++;
      return 'success';
    } catch (e) {
      if (isAbortError(e)) throw e;
      console.warn(`[card-image-download] render failed for ${cardId}:`, (e as Error).message);
      return 'failed';
    }
  }

  private async downloadTile(cardId: string, signal: AbortSignal): Promise<'success' | 'failed' | 'skip'> {
    try {
      await ensureCardTileCached(cardId, {
        root: this.deps.cacheRoot,
        fetchImpl: this.deps.fetchImpl,
      });
      this.progress!.stats.downloadedTiles++;
      return 'success';
    } catch (e) {
      if (isAbortError(e)) throw e;
      console.warn(`[card-image-download] tile failed for ${cardId}:`, (e as Error).message);
      return 'failed';
    }
  }

  private async persist(): Promise<void> {
    if (!this.progress) return;
    await saveProgress(this.deps.cacheRoot, this.progress);
    this.broadcast();
  }

  private broadcast(): void {
    this.progressCb(this.getStatus());
  }
}

function emptyStats(): BulkDownloadProgress['stats'] {
  return {
    downloadedRenders: 0,
    downloadedTiles: 0,
    skippedRenders: 0,
    skippedTiles: 0,
    failed: 0,
  };
}

function abortError(): Error {
  const err = new Error('aborted');
  err.name = 'AbortError';
  return err;
}

function isAbortError(e: unknown): boolean {
  return (e as Error | undefined)?.name === 'AbortError';
}

function addToSet(arr: string[], value: string): void {
  if (!arr.includes(value)) arr.push(value);
}

function removeFromArray(arr: string[], value: string): void {
  const idx = arr.indexOf(value);
  if (idx !== -1) arr.splice(idx, 1);
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await worker(items[index]!);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
}
```

**Note:** The `downloadRender` / `downloadTile` helper currently does not distinguish "already cached" from "downloaded". The `skipped*` counters will be added in Task 4.

- [ ] **Step 4: Run the tests and expect pass**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/main/card-image-download/orchestrator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/card-image-download/orchestrator.ts apps/desktop/src/main/card-image-download/orchestrator.test.ts
git commit -m "feat(card-image-download): add bulk download orchestrator"
```

---

## Task 4: Robustness (pause/resume, retry failed, skipped counters, disk space)

**Files:**
- Modify: `apps/desktop/src/main/card-image-download/orchestrator.ts`
- Modify: `apps/desktop/src/main/card-image-download/orchestrator.test.ts`

- [ ] **Step 1: Add failing tests for pause/resume and skipped counters**

Append to `apps/desktop/src/main/card-image-download/orchestrator.test.ts`:

```ts
import { mkdir, stat } from 'node:fs/promises';

// ... inside describe('CardImageBulkDownloadOrchestrator', () => { ... })

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

    // Start then immediately pause.
    const startPromise = orchestrator.start(['render']);
    orchestrator.pause();
    const pausedResult = await startPromise;
    expect(pausedResult.ok).toBe(true);
    expect(pausedResult.ok && pausedResult.status.state).toBe('paused');

    const fetchedBeforeResume = fetchCount;
    expect(fetchedBeforeResume).toBeGreaterThanOrEqual(0);
    expect(fetchedBeforeResume).toBeLessThan(2);

    // Resume with a fresh orchestrator instance to prove persistence.
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
    // 410 Gone is not retryable, so both primary and fallback fail quickly.
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
    expect(second.ok && second.status.stats.failed).toBe(1); // historical counter preserved
  });
```

- [ ] **Step 2: Run the tests and expect some failures**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/main/card-image-download/orchestrator.test.ts
```

Expected: FAIL — `pause()` may not abort quickly enough, and `resume()` with a fresh instance may not use the persisted progress correctly.

- [ ] **Step 3: Update orchestrator to support pause/resume properly and count skips**

Modify `apps/desktop/src/main/card-image-download/orchestrator.ts`:

1. Change `downloadRender` and `downloadTile` to return whether the file was skipped or downloaded:

```ts
private async downloadRender(cardId: string, signal: AbortSignal): Promise<'success' | 'skipped' | 'failed'> {
  const cachePath = cardImageCachePath({
    root: this.deps.cacheRoot,
    locale: CARD_IMAGE_PRIMARY_LOCALE,
    size: CARD_IMAGE_SIZE,
    cardId,
  });
  const fallbackPath = cardImageCachePath({
    root: this.deps.cacheRoot,
    locale: CARD_IMAGE_FALLBACK_LOCALE,
    size: CARD_IMAGE_SIZE,
    cardId,
  });

  try {
    const alreadyCached = await fileExists(cachePath) || await fileExists(fallbackPath);
    await ensureCardImageCached(cardId, {
      root: this.deps.cacheRoot,
      fetchImpl: this.deps.fetchImpl,
    });
    if (alreadyCached) {
      this.progress!.stats.skippedRenders++;
      return 'skipped';
    }
    this.progress!.stats.downloadedRenders++;
    return 'success';
  } catch (e) {
    if (isAbortError(e)) throw e;
    console.warn(`[card-image-download] render failed for ${cardId}:`, (e as Error).message);
    return 'failed';
  }
}

private async downloadTile(cardId: string, signal: AbortSignal): Promise<'success' | 'skipped' | 'failed'> {
  const cachePath = cardTileCachePath({ root: this.deps.cacheRoot, cardId });
  try {
    const alreadyCached = await fileExists(cachePath);
    await ensureCardTileCached(cardId, {
      root: this.deps.cacheRoot,
      fetchImpl: this.deps.fetchImpl,
    });
    if (alreadyCached) {
      this.progress!.stats.skippedTiles++;
      return 'skipped';
    }
    this.progress!.stats.downloadedTiles++;
    return 'success';
  } catch (e) {
    if (isAbortError(e)) throw e;
    console.warn(`[card-image-download] tile failed for ${cardId}:`, (e as Error).message);
    return 'failed';
  }
}
```

2. Update imports at the top of `orchestrator.ts`:

```ts
import {
  cardImageCachePath,
  cardTileCachePath,
  CARD_IMAGE_FALLBACK_LOCALE,
  CARD_IMAGE_PRIMARY_LOCALE,
  CARD_IMAGE_SIZE,
  ensureCardImageCached,
  ensureCardTileCached,
} from '../card-image-cache';
```

3. Add a `fileExists` helper in `orchestrator.ts`:

```ts
import { stat } from 'node:fs/promises';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}
```

4. Update `runLoop` to treat `'skipped'` as success and to handle pause correctly. The pause issue is that `pause()` aborts the controller, but in-flight `ensureCardImageCached` calls catch the abort and return `'failed'` instead of rethrowing. Fix by checking `signal.aborted` immediately after each download attempt:

```ts
const renderResult = progress.types.includes('render')
  ? await this.downloadRender(cardId, signal)
  : 'skip';
if (signal.aborted) throw abortError();
const tileResult = progress.types.includes('tile')
  ? await this.downloadTile(cardId, signal)
  : 'skip';
if (signal.aborted) throw abortError();
```

5. Update completion logic to count any non-failed result as completion:

```ts
const renderFailed = renderResult === 'failed';
const tileFailed = tileResult === 'failed';
if (renderFailed || tileFailed) {
  addToSet(progress.failedCardIds, cardId);
  progress.stats.failed++;
} else {
  addToSet(progress.completedCardIds, cardId);
  removeFromArray(progress.failedCardIds, cardId);
}
```

- [ ] **Step 4: Add disk-space guard tests and implementation**

Append to `orchestrator.test.ts`:

```ts
  it('refuses to start when disk space is insufficient', async () => {
    const root = await makeTempDir();
    const cacheRoot = path.join(root, 'cache');
    const orchestrator = new CardImageBulkDownloadOrchestrator({
      cacheRoot,
      getCardIds: async () => ['CS2_029'],
      fetchImpl: vi.fn(async () => pngResponse()),
    });

    // Stub disk space to a tiny value.
    vi.spyOn(await import('node:fs/promises'), 'statfs').mockResolvedValue({
      available: 1,
      bsize: 1,
    } as unknown as Awaited<ReturnType<typeof import('node:fs/promises').statfs>>);

    const result = await orchestrator.start(['render', 'tile']);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe('insufficient-disk-space');
  });
```

Add a disk-space check at the beginning of `start()`:

```ts
import { statfs } from 'node:fs/promises';

const DISK_SPACE_SAFETY_MARGIN_BYTES = 500 * 1024 * 1024;
const BYTES_PER_CARD_ESTIMATE = 350 * 1024;
const DISK_CHECK_INTERVAL_CARDS = 50;

// Inside start(), before setting inFlight:
const pendingForSpaceCheck = this.progress
  ? this.progress.cardIds.filter((id) => !this.progress!.completedCardIds.includes(id))
  : await this.deps.getCardIds();
const spaceCheck = await checkDiskSpace(this.deps.cacheRoot, pendingForSpaceCheck.length, types.length);
if (!spaceCheck.ok) {
  return { ok: false, error: 'insufficient-disk-space' };
}
```

Implement `checkDiskSpace` and a mid-run check inside `runLoop`:

```ts
async function checkDiskSpace(
  cacheRoot: string,
  pendingCount: number,
  typeCount: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const estimatedBytes = pendingCount * typeCount * BYTES_PER_CARD_ESTIMATE;
  const requiredBytes = estimatedBytes * 1.2 + DISK_SPACE_SAFETY_MARGIN_BYTES;
  try {
    const stats = await statfs(cacheRoot);
    const freeBytes = stats.bavail * stats.bsize;
    if (freeBytes < requiredBytes) {
      return { ok: false, error: 'insufficient-disk-space' };
    }
  } catch {
    // If we cannot determine disk space, proceed anyway.
  }
  return { ok: true };
}
```

In `runLoop`, every `DISK_CHECK_INTERVAL_CARDS` processed cards:

```ts
      processedSinceDiskCheck++;
      if (processedSinceDiskCheck >= DISK_CHECK_INTERVAL_CARDS) {
        const remaining = progress.cardIds.length - progress.completedCardIds.length;
        const check = await checkDiskSpace(this.deps.cacheRoot, remaining, progress.types.length);
        if (!check.ok) {
          progress.paused = true;
          progress.stoppedAt = new Date().toISOString();
          await this.persist();
          this.state = 'paused';
          return { ok: true, status: this.getStatus() };
        }
        processedSinceDiskCheck = 0;
      }
```

- [ ] **Step 5: Run the tests and expect pass**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/main/card-image-download/orchestrator.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/main/card-image-download/orchestrator.ts apps/desktop/src/main/card-image-download/orchestrator.test.ts
git commit -m "feat(card-image-download): add pause/resume, retry, skip counters, disk-space guards"
```

---

## Task 5: IPC wiring

**Files:**
- Create: `apps/desktop/src/main/card-image-download/ipc.ts`
- Create: `apps/desktop/src/main/card-image-download/ipc.test.ts`

- [ ] **Step 1: Write failing IPC tests**

Create `apps/desktop/src/main/card-image-download/ipc.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const sent: Array<{ channel: string; args: unknown[] }> = [];
  const ipcMain = {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
    invoke: (channel: string, ...args: unknown[]) => {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`No handler for ${channel}`);
      return fn({}, ...args);
    },
  };
  const BrowserWindow = {
    getAllWindows: () => windows,
    __sent: sent,
  };
  const windows: Array<{ isDestroyed: () => boolean; webContents: { send: (c: string, ...a: unknown[]) => void } }> = [
    {
      isDestroyed: () => false,
      webContents: {
        send: (channel: string, ...args: unknown[]) => {
          sent.push({ channel, args });
        },
      },
    },
  ];
  return { ipcMain, BrowserWindow };
});

import * as electron from 'electron';
import {
  CARD_IMAGE_BULK_DOWNLOAD_ABORT_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_PAUSE_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_PROGRESS_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_RESUME_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_STATUS_CHANNEL,
  registerCardImageBulkDownloadIpc,
} from './ipc';
import type { CardImageBulkDownloadOrchestrator } from './orchestrator';

interface MockOrchestrator {
  start: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  getStatus: ReturnType<typeof vi.fn>;
}

describe('registerCardImageBulkDownloadIpc', () => {
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    (electron.BrowserWindow as unknown as { __sent: Array<unknown> }).__sent.length = 0;
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
  });

  it('registers handlers for the documented channels', () => {
    const orch: MockOrchestrator = {
      start: vi.fn(async () => ({ ok: true, status: { state: 'running' } })),
      pause: vi.fn(),
      resume: vi.fn(async () => ({ ok: true, status: { state: 'running' } })),
      abort: vi.fn(),
      getStatus: vi.fn(() => ({ state: 'idle' })),
    };

    dispose = registerCardImageBulkDownloadIpc(orch as unknown as CardImageBulkDownloadOrchestrator);
    const handleSpy = vi.mocked(electron.ipcMain.handle);
    const channels = handleSpy.mock.calls.map((c) => c[0] as string);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_PAUSE_CHANNEL);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_RESUME_CHANNEL);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_ABORT_CHANNEL);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_STATUS_CHANNEL);
  });

  it('invoking start delegates to orchestrator.start', async () => {
    const orch: MockOrchestrator = {
      start: vi.fn(async () => ({ ok: true, status: { state: 'running' } })),
      pause: vi.fn(),
      resume: vi.fn(),
      abort: vi.fn(),
      getStatus: vi.fn(),
    };
    dispose = registerCardImageBulkDownloadIpc(orch as unknown as CardImageBulkDownloadOrchestrator);
    const ipcMain = electron.ipcMain as unknown as { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> };

    const result = await ipcMain.invoke(CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL, ['render'], true);
    expect(result).toEqual({ ok: true, status: { state: 'running' } });
    expect(orch.start).toHaveBeenCalledWith(['render'], expect.any(Function), true);
  });

  it('broadcasts progress to renderer windows', async () => {
    const orch: MockOrchestrator = {
      start: vi.fn(async (_types, cb) => {
        cb({ state: 'running' });
        return { ok: true, status: { state: 'completed' } };
      }),
      pause: vi.fn(),
      resume: vi.fn(),
      abort: vi.fn(),
      getStatus: vi.fn(),
    };

    dispose = registerCardImageBulkDownloadIpc(orch as unknown as CardImageBulkDownloadOrchestrator);
    const ipcMain = electron.ipcMain as unknown as { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> };
    await ipcMain.invoke(CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL, [['render']]);

    const sent = (electron.BrowserWindow as unknown as { __sent: Array<{ channel: string; args: unknown[] }> }).__sent;
    expect(sent.some((s) => s.channel === CARD_IMAGE_BULK_DOWNLOAD_PROGRESS_CHANNEL)).toBe(true);
  });

  it('dispose removes all handlers', () => {
    const orch: MockOrchestrator = {
      start: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      abort: vi.fn(),
      getStatus: vi.fn(),
    };
    const local = registerCardImageBulkDownloadIpc(orch as unknown as CardImageBulkDownloadOrchestrator);
    local();
    const removeSpy = vi.mocked(electron.ipcMain.removeHandler);
    const channels = removeSpy.mock.calls.map((c) => c[0]);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_PAUSE_CHANNEL);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_RESUME_CHANNEL);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_ABORT_CHANNEL);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_STATUS_CHANNEL);
  });
});
```

- [ ] **Step 2: Run the tests and expect failure**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/main/card-image-download/ipc.test.ts
```

Expected: FAIL — IPC module not defined.

- [ ] **Step 3: Implement ipc.ts**

Create `apps/desktop/src/main/card-image-download/ipc.ts`:

```ts
import { BrowserWindow, ipcMain } from 'electron';
import type {
  BulkDownloadProgressCallback,
  CardImageBulkDownloadOrchestrator,
} from './orchestrator';

export const CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL = 'card-image-bulk-download:start';
export const CARD_IMAGE_BULK_DOWNLOAD_PAUSE_CHANNEL = 'card-image-bulk-download:pause';
export const CARD_IMAGE_BULK_DOWNLOAD_RESUME_CHANNEL = 'card-image-bulk-download:resume';
export const CARD_IMAGE_BULK_DOWNLOAD_ABORT_CHANNEL = 'card-image-bulk-download:abort';
export const CARD_IMAGE_BULK_DOWNLOAD_STATUS_CHANNEL = 'card-image-bulk-download:status';
export const CARD_IMAGE_BULK_DOWNLOAD_PROGRESS_CHANNEL = 'card-image-bulk-download:progress';

export function registerCardImageBulkDownloadIpc(
  orchestrator: CardImageBulkDownloadOrchestrator,
): () => void {
  const progressCb: BulkDownloadProgressCallback = (status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(CARD_IMAGE_BULK_DOWNLOAD_PROGRESS_CHANNEL, status);
      }
    }
  };

  ipcMain.handle(
    CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL,
    async (_, types: import('./index').BulkDownloadType[], force?: boolean) =>
      orchestrator.start(types, progressCb, force),
  );
  ipcMain.handle(CARD_IMAGE_BULK_DOWNLOAD_PAUSE_CHANNEL, () => orchestrator.pause());
  ipcMain.handle(CARD_IMAGE_BULK_DOWNLOAD_RESUME_CHANNEL, async () => orchestrator.resume(progressCb));
  ipcMain.handle(CARD_IMAGE_BULK_DOWNLOAD_ABORT_CHANNEL, () => orchestrator.abort());
  ipcMain.handle(CARD_IMAGE_BULK_DOWNLOAD_STATUS_CHANNEL, () => orchestrator.getStatus());

  return () => {
    ipcMain.removeHandler(CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL);
    ipcMain.removeHandler(CARD_IMAGE_BULK_DOWNLOAD_PAUSE_CHANNEL);
    ipcMain.removeHandler(CARD_IMAGE_BULK_DOWNLOAD_RESUME_CHANNEL);
    ipcMain.removeHandler(CARD_IMAGE_BULK_DOWNLOAD_ABORT_CHANNEL);
    ipcMain.removeHandler(CARD_IMAGE_BULK_DOWNLOAD_STATUS_CHANNEL);
  };
}
```

- [ ] **Step 4: Run the tests and expect pass**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/main/card-image-download/ipc.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/card-image-download/ipc.ts apps/desktop/src/main/card-image-download/ipc.test.ts
git commit -m "feat(card-image-download): add IPC wiring and progress broadcast"
```

---

## Task 6: Main-process integration

**Files:**
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/main/ipc.test.ts` (if exists and covers IPC registration)

- [ ] **Step 1: Add a helper to resolve collectible cards JSON path**

Create `apps/desktop/src/main/card-image-download/card-ids.ts`:

```ts
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';
import { readFile } from 'node:fs/promises';

export async function loadCollectibleCardIds(locale = 'zhCN'): Promise<string[]> {
  const relativeJsonPath = `data/cards/generated/cards.collectible.${locale}.json`;
  const here = dirname(fileURLToPath(import.meta.url));
  const appPath = typeof app?.getAppPath === 'function' ? app.getAppPath() : null;
  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : null;

  const candidates = [
    ...(resourcesPath ? [resolve(resourcesPath, relativeJsonPath)] : []),
    resolve(here, '../../../../..', relativeJsonPath),
    resolve(process.cwd(), relativeJsonPath),
    ...(appPath
      ? [resolve(appPath, relativeJsonPath), resolve(appPath, '../..', relativeJsonPath)]
      : []),
  ];

  let chosen: string | null = null;
  for (const p of candidates) {
    if (existsSync(p)) {
      chosen = p;
      break;
    }
  }
  if (!chosen) {
    throw new Error(`collectible card data not found; tried ${candidates.join(', ')}`);
  }

  const raw = await readFile(chosen, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`collectible card data must be an array: ${chosen}`);
  }
  const ids = new Set<string>();
  for (const row of parsed as Array<{ id?: unknown }>) {
    if (typeof row.id === 'string' && row.id.length > 0) {
      ids.add(row.id);
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}
```

- [ ] **Step 2: Wire the orchestrator into ipc.ts**

Modify `apps/desktop/src/main/ipc.ts`:

1. Add imports near the top:

```ts
import { app } from 'electron';
import { CardImageBulkDownloadOrchestrator } from './card-image-download/orchestrator';
import { registerCardImageBulkDownloadIpc } from './card-image-download/ipc';
import { loadCollectibleCardIds } from './card-image-download/card-ids';
```

2. After the popular-decks sync setup (around line 407), add:

```ts
  // Bulk card-image pre-download. Shares the on-demand card-image cache root.
  const cardImageBulkDownload = new CardImageBulkDownloadOrchestrator({
    cacheRoot: cardImageRoot,
    getCardIds: () => loadCollectibleCardIds('zhCN'),
    fetchImpl: (url, init) => net.fetch(url, init as Parameters<typeof net.fetch>[1]),
  });
  const disposeCardImageBulkDownloadIpc = registerCardImageBulkDownloadIpc(cardImageBulkDownload);
```

3. In the `before-quit` handler, add:

```ts
    cardImageBulkDownload.abort();
    disposeCardImageBulkDownloadIpc();
```

- [ ] **Step 3: Verify integration with typecheck**

Run:

```bash
pnpm --filter @hdt/desktop typecheck
```

Expected: PASS (no TypeScript errors).

- [ ] **Step 4: Run the full card-image-download test suite**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/main/card-image-download/
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/card-image-download/card-ids.ts apps/desktop/src/main/ipc.ts
git commit -m "feat(card-image-download): wire orchestrator into main IPC"
```

---

## Task 7: Preload API surface (future UI hookup)

**Files:**
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/index.test.ts`

- [ ] **Step 1: Extend the preload cardImages API**

Modify `apps/desktop/src/preload/index.ts`:

1. Import the channel names from the IPC module:

```ts
import {
  CARD_IMAGE_BULK_DOWNLOAD_ABORT_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_PAUSE_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_PROGRESS_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_RESUME_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_STATUS_CHANNEL,
} from '../main/card-image-download/ipc';
import type {
  BulkDownloadState,
  BulkDownloadStatus,
  BulkDownloadType,
  StartBulkDownloadResult,
} from '../main/card-image-download/index';
```

2. Extend `cardImages` in the exposed API:

```ts
  cardImages: {
    get: (
      cardId: string,
      locale?: AppLocale,
    ): Promise<{ url: string; locale: string; size: string } | null> =>
      ipcRenderer.invoke('card-images:get', cardId, locale),
    getTile: (cardId: string): Promise<{ url: string } | null> =>
      ipcRenderer.invoke('card-images:getTile', cardId),
    bulkDownload: {
      start: (types: BulkDownloadType[], force?: boolean): Promise<StartBulkDownloadResult> =>
        ipcRenderer.invoke(CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL, types, force),
      pause: (): Promise<void> => ipcRenderer.invoke(CARD_IMAGE_BULK_DOWNLOAD_PAUSE_CHANNEL),
      resume: (): Promise<StartBulkDownloadResult> =>
        ipcRenderer.invoke(CARD_IMAGE_BULK_DOWNLOAD_RESUME_CHANNEL),
      abort: (): Promise<void> => ipcRenderer.invoke(CARD_IMAGE_BULK_DOWNLOAD_ABORT_CHANNEL),
      getStatus: (): Promise<BulkDownloadStatus> =>
        ipcRenderer.invoke(CARD_IMAGE_BULK_DOWNLOAD_STATUS_CHANNEL),
      onProgress: (cb: (status: BulkDownloadStatus) => void): (() => void) => {
        const handler = (_e: IpcRendererEvent, status: BulkDownloadStatus): void => cb(status);
        ipcRenderer.on(CARD_IMAGE_BULK_DOWNLOAD_PROGRESS_CHANNEL, handler);
        return () => {
          ipcRenderer.removeListener(CARD_IMAGE_BULK_DOWNLOAD_PROGRESS_CHANNEL, handler);
        };
      },
    },
  },
```

3. Update the `HdtPreloadApi` type definition if one exists near the bottom of `preload/index.ts`.

- [ ] **Step 2: Add a preload test for the new channels**

Modify `apps/desktop/src/preload/index.test.ts`:

Add a test that verifies `cardImages.bulkDownload.start` invokes the correct channel:

```ts
  it('exposes card image bulk download channels', async () => {
    mocks.ipcRenderer.invoke.mockResolvedValue({ ok: true, status: { state: 'running' } });
    const api = mocks.exposed as {
      cardImages: {
        bulkDownload: {
          start: (types: string[], force?: boolean) => Promise<unknown>;
        };
      };
    };
    const result = await api.cardImages.bulkDownload.start(['render'], true);
    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(
      'card-image-bulk-download:start',
      ['render'],
      true,
    );
    expect(result).toEqual({ ok: true, status: { state: 'running' } });
  });
```

- [ ] **Step 3: Run preload tests and typecheck**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run src/preload/index.test.ts
pnpm --filter @hdt/desktop typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/preload/index.ts apps/desktop/src/preload/index.test.ts
git commit -m "feat(card-image-download): expose bulk download API in preload"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run the full desktop test suite**

Run:

```bash
pnpm --filter @hdt/desktop exec vitest run
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
pnpm --filter @hdt/desktop lint
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test (dev build)**

Run:

```bash
pnpm dev
```

In the renderer devtools console, exercise the API:

```js
await window.hdt.cardImages.bulkDownload.getStatus();
// { state: 'idle', progress: { completed: 0, total: 0, failed: 0, currentCardId: null }, stats: {...} }

const unsub = window.hdt.cardImages.bulkDownload.onProgress((s) => console.log(s));
const r = await window.hdt.cardImages.bulkDownload.start(['render'], false);
console.log(r);

// While running:
await window.hdt.cardImages.bulkDownload.pause();
await window.hdt.cardImages.bulkDownload.resume();
await window.hdt.cardImages.bulkDownload.abort();
unsub();
```

Expected:
- `start` returns `{ ok: true, status: { state: 'running' } }`.
- Progress events fire with increasing `completed` count.
- `pause` transitions to `paused` and persist file is written.
- `resume` continues from where it left off.
- `abort` stops the run but keeps the progress file.

- [ ] **Step 4: Commit any test/fix changes**

```bash
git add -A
git commit -m "test(card-image-download): add final verification and smoke-test fixes"
```

---
