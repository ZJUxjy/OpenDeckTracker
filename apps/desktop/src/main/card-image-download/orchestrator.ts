import { stat } from 'node:fs/promises';
import {
  cardImageCachePath,
  cardTileCachePath,
  CARD_IMAGE_FALLBACK_LOCALE,
  CARD_IMAGE_PRIMARY_LOCALE,
  CARD_IMAGE_SIZE,
  ensureCardImageCached,
  ensureCardTileCached,
} from '../card-image-cache';
import {
  BULK_DOWNLOAD_PROGRESS_SCHEMA_VERSION,
  type BulkDownloadProgress,
  type BulkDownloadState,
  type BulkDownloadStatus,
  type BulkDownloadType,
  type StartBulkDownloadResult,
} from './index';
import { loadProgress, saveProgress } from './storage';

const DISK_SPACE_SAFETY_MARGIN_BYTES = 500 * 1024 * 1024;
const BYTES_PER_CARD_ESTIMATE = 350 * 1024;
const DISK_CHECK_INTERVAL_CARDS = 50;

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
  private progress: BulkDownloadProgress | null = null;
  private progressCb: BulkDownloadProgressCallback = () => undefined;
  private persistLock: Promise<void> | null = null;

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

    this.inFlight = true;
    this.progressCb = progressCb ?? (() => undefined);
    this.currentController = new AbortController();
    this.state = 'running';
    this.broadcast();

    try {
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

      const pendingForSpaceCheck = this.progress.cardIds.filter(
        (id) => !this.progress!.completedCardIds.includes(id),
      );
      const spaceCheck = await checkDiskSpace(
        this.deps.cacheRoot,
        pendingForSpaceCheck.length,
        types.length,
      );
      if (!spaceCheck.ok) {
        return { ok: false, error: 'insufficient-disk-space' };
      }

      return await this.runLoop(this.currentController.signal);
    } catch (e) {
      if (isAbortError(e)) {
        if (this.progress) {
          this.progress.paused = true;
          this.progress.stoppedAt = new Date().toISOString();
          await this.persist();
        }
        this.state = 'paused';
        return { ok: true, status: this.getStatus() };
      }
      this.state = 'failed';
      throw e;
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

  async resume(progressCb?: BulkDownloadProgressCallback): Promise<StartBulkDownloadResult> {
    const loaded = await loadProgress(this.deps.cacheRoot);
    const types = loaded?.types ?? this.progress?.types ?? ['render', 'tile'];
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
        if (signal.aborted) throw abortError();
        const tileResult = progress.types.includes('tile')
          ? await this.downloadTile(cardId, signal)
          : 'skip';
        if (signal.aborted) throw abortError();

        const renderFailed = renderResult === 'failed';
        const tileFailed = tileResult === 'failed';
        if (renderFailed || tileFailed) {
          addToSet(progress.failedCardIds, cardId);
          progress.stats.failed++;
        } else {
          addToSet(progress.completedCardIds, cardId);
          removeFromArray(progress.failedCardIds, cardId);
        }

        progress.updatedAt = new Date().toISOString();
        processedSincePersist++;
        if (processedSincePersist >= persistEvery) {
          await this.persist();
          processedSincePersist = 0;
        }

        processedSinceDiskCheck++;
        if (processedSinceDiskCheck >= DISK_CHECK_INTERVAL_CARDS) {
          const remaining = progress.cardIds.length - progress.completedCardIds.length;
          const check = await checkDiskSpace(this.deps.cacheRoot, remaining, progress.types.length);
          if (!check.ok) {
            progress.paused = true;
            progress.stoppedAt = new Date().toISOString();
            await this.persist();
            this.state = 'paused';
            return;
          }
          processedSinceDiskCheck = 0;
        }

        this.currentCardId = null;
      });
    } catch (e) {
      if (!isAbortError(e)) throw e;
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

  private async downloadRender(
    cardId: string,
    _signal: AbortSignal,
  ): Promise<'success' | 'skipped' | 'failed'> {
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
      const alreadyCached = (await fileExists(cachePath)) || (await fileExists(fallbackPath));
      await ensureCardImageCached(cardId, {
        root: this.deps.cacheRoot,
        ...(this.deps.fetchImpl ? { fetchImpl: this.deps.fetchImpl } : {}),
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

  private async downloadTile(
    cardId: string,
    _signal: AbortSignal,
  ): Promise<'success' | 'skipped' | 'failed'> {
    const cachePath = cardTileCachePath({ root: this.deps.cacheRoot, cardId });
    try {
      const alreadyCached = await fileExists(cachePath);
      await ensureCardTileCached(cardId, {
        root: this.deps.cacheRoot,
        ...(this.deps.fetchImpl ? { fetchImpl: this.deps.fetchImpl } : {}),
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

  private async persist(): Promise<void> {
    if (!this.progress) return;
    if (this.persistLock) {
      await this.persistLock;
      return;
    }

    const promise = saveProgress(this.deps.cacheRoot, this.progress)
      .then(() => {
        this.persistLock = null;
      })
      .catch((err) => {
        this.persistLock = null;
        throw err;
      });
    this.persistLock = promise;

    await promise;
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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
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

async function checkDiskSpace(
  cacheRoot: string,
  pendingCount: number,
  typeCount: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const estimatedBytes = pendingCount * typeCount * BYTES_PER_CARD_ESTIMATE;
  const requiredBytes = estimatedBytes * 1.2 + DISK_SPACE_SAFETY_MARGIN_BYTES;
  try {
    const { statfs } = await import('node:fs/promises');
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
