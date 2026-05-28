import type { PopularDeck, PopularDeckClassMatchup } from '@hdt/core';
import {
  type BrowserFetchText,
  fetchHsguruArchetypeVariants,
  fetchHsguruDeckDetail,
  fetchHsguruMeta,
  type FetchImpl,
} from './fetcher';
import { parseDeckClassMatchups, parseDeckVariants, parseLegendArchetypes } from './parser';
import { transformVariant, type TransformContext } from './transformer';
import { loadCache, saveCache, type SyncedSnapshot } from './storage';

export type SyncPhase = 'meta' | 'variants' | 'details' | 'persist';

export interface SyncProgress {
  phase: SyncPhase;
  completed: number;
  total: number;
  currentLabel?: string;
}

export type StartSyncResult =
  | { ok: true; fetchedAt: string; count: number }
  | { ok: false; error: string };

export interface SyncStatus {
  inFlight: boolean;
  lastFetchedAt: string | null;
}

export interface SyncDeps {
  fetchImpl: FetchImpl;
  /** Returns the live CardDb-backed lookup, or null when not yet loaded. */
  getCardLookup: () => TransformContext['findByDbfId'] | null;
  /** Directory where `synced.json` lives (typically `<userData>/popular-decks`). */
  cacheDir: string;
  browserFetchText?: BrowserFetchText;
  /** Override for tests; default uses real setTimeout-backed delay. */
  delay?: (ms: number) => Promise<void>;
  now?: () => Date;
  /** Cap on archetypes/variants per archetype. */
  archetypeLimit?: number;
  variantLimit?: number;
  /** Cap on parallel HSGuru archetype deck-list page fetches. */
  variantConcurrency?: number;
  /** Cap on parallel HSGuru deck-detail page fetches. */
  detailConcurrency?: number;
}

export type ProgressCallback = (progress: SyncProgress) => void;
export type SnapshotChangeCallback = (snapshot: SyncedSnapshot | null) => void;

export class PopularDeckSyncOrchestrator {
  private inFlight = false;
  private lastFetchedAt: string | null = null;
  private snapshot: SyncedSnapshot | null = null;
  private snapshotListeners: Set<SnapshotChangeCallback> = new Set();
  private currentController: AbortController | null = null;

  constructor(private readonly deps: SyncDeps) {}

  getStatus(): SyncStatus {
    return { inFlight: this.inFlight, lastFetchedAt: this.lastFetchedAt };
  }

  getSnapshot(): SyncedSnapshot | null {
    return this.snapshot;
  }

  onSnapshotChange(cb: SnapshotChangeCallback): () => void {
    this.snapshotListeners.add(cb);
    return () => {
      this.snapshotListeners.delete(cb);
    };
  }

  async loadCacheOnce(): Promise<SyncedSnapshot | null> {
    const loaded = await loadCache(this.deps.cacheDir);
    this.snapshot = loaded;
    if (loaded) this.lastFetchedAt = loaded.fetchedAt;
    return loaded;
  }

  /** Cancels any in-flight sync. Safe to call when no sync is running. */
  abort(): void {
    this.currentController?.abort();
  }

  async startSync(progressCb: ProgressCallback): Promise<StartSyncResult> {
    if (this.inFlight) return { ok: false, error: 'already-syncing' };
    const lookup = this.deps.getCardLookup();
    if (!lookup) return { ok: false, error: 'card-db-not-ready' };

    this.inFlight = true;
    const controller = new AbortController();
    this.currentController = controller;
    try {
      return await this.runSync(progressCb, lookup, controller.signal);
    } finally {
      this.inFlight = false;
      this.currentController = null;
    }
  }

  private async runSync(
    progressCb: ProgressCallback,
    lookup: TransformContext['findByDbfId'],
    signal: AbortSignal,
  ): Promise<StartSyncResult> {
    const delay = this.deps.delay ?? ((ms: number) =>
      new Promise<void>((r) => setTimeout(r, ms)));
    const now = this.deps.now ?? (() => new Date());
    const archetypeLimit = this.deps.archetypeLimit ?? 20;
    const variantLimit = this.deps.variantLimit ?? 5;
    const variantConcurrency = this.deps.variantConcurrency ?? 4;
    const detailConcurrency = this.deps.detailConcurrency ?? 4;
    const fetcherDeps = {
      fetchImpl: this.deps.fetchImpl,
      delay,
      ...(this.deps.browserFetchText ? { browserFetchText: this.deps.browserFetchText } : {}),
    };
    const cachedSnapshot = this.snapshot ?? await this.loadCacheOnce();
    const cachedMatchupsByDeckId = buildCachedClassMatchupsByDeckId(cachedSnapshot);
    const fetchedAt = now().toISOString();
    console.log('[popular-decks-sync] start', { fetchedAt, cacheDir: this.deps.cacheDir });

    // Phase 1: meta
    progressCb({ phase: 'meta', completed: 0, total: 1 });
    let metaHtml: string;
    const metaStart = Date.now();
    try {
      metaHtml = await fetchHsguruMeta(
        fetcherDeps,
        signal,
      );
    } catch (e) {
      console.error('[popular-decks-sync] meta fetch failed', {
        elapsedMs: Date.now() - metaStart,
        name: (e as Error)?.name,
        message: (e as Error)?.message,
      });
      return { ok: false, error: classifyError(e, 'network-failed') };
    }
    console.log('[popular-decks-sync] meta fetched', {
      elapsedMs: Date.now() - metaStart,
      bytes: metaHtml.length,
    });
    const archetypes = parseLegendArchetypes(metaHtml, archetypeLimit);
    if (archetypes.length === 0) {
      console.warn('[popular-decks-sync] meta parse yielded 0 archetypes (DOM changed?)');
      return { ok: false, error: 'parse-failed' };
    }
    console.log(`[popular-decks-sync] parsed ${archetypes.length} archetypes`);
    progressCb({ phase: 'meta', completed: 1, total: 1 });

    // Phase 2: variants (one round-trip set per archetype)
    const variantsByArchetypeResults: Array<{
      archetype: typeof archetypes[number];
      variants: ReturnType<typeof parseDeckVariants>;
    } | null> = new Array(archetypes.length).fill(null);
    let completedArchetypes = 0;
    progressCb({
      phase: 'variants',
      completed: 0,
      total: archetypes.length,
      ...(archetypes[0] ? { currentLabel: archetypes[0].archetype } : {}),
    });
    try {
      await runLimitedConcurrency(archetypes, variantConcurrency, async (archetype, index) => {
        if (signal.aborted) throw abortError();
        let result: { html: string; url: string } | null;
        const variantStart = Date.now();
        try {
          result = await fetchHsguruArchetypeVariants(
            archetype.archetype,
            fetcherDeps,
            signal,
          );
        } catch (e) {
          console.error('[popular-decks-sync] variants fetch failed', {
            archetype: archetype.archetype,
            elapsedMs: Date.now() - variantStart,
            name: (e as Error)?.name,
            message: (e as Error)?.message,
          });
          throw e;
        }
        const variants = result ? parseDeckVariants(result.html, variantLimit) : [];
        console.log(
          `[popular-decks-sync] variants ${completedArchetypes + 1}/${archetypes.length} ${archetype.archetype}: ${variants.length} decks (${Date.now() - variantStart}ms)`,
        );
        variantsByArchetypeResults[index] = { archetype, variants };
        completedArchetypes++;
        progressCb({
          phase: 'variants',
          completed: completedArchetypes,
          total: archetypes.length,
          currentLabel: archetype.archetype,
        });
      });
    } catch (e) {
      return { ok: false, error: classifyError(e, 'network-failed') };
    }
    const variantsByArchetype = variantsByArchetypeResults.filter(
      (result): result is NonNullable<typeof result> => result !== null,
    );
    progressCb({
      phase: 'variants',
      completed: archetypes.length,
      total: archetypes.length,
    });

    // Phase 3: deck details + transform
    const detailTasks = variantsByArchetype.flatMap(({ archetype, variants }) =>
      variants.map((variant) => ({ archetype, variant })),
    );
    const decksByTask: Array<PopularDeck | null> = new Array(detailTasks.length).fill(null);
    const totalVariants = variantsByArchetype.reduce((s, x) => s + x.variants.length, 0);
    let processed = 0;
    progressCb({ phase: 'details', completed: 0, total: Math.max(totalVariants, 1) });
    try {
      await runLimitedConcurrency(detailTasks, detailConcurrency, async ({ archetype, variant }, index) => {
        if (signal.aborted) throw abortError();
        const baseDeck = transformVariant(
          archetype,
          variant,
          fetchedAt,
          { findByDbfId: lookup },
        );
        if (!baseDeck) {
          processed++;
          progressCb({
            phase: 'details',
            completed: processed,
            total: Math.max(totalVariants, 1),
            currentLabel: archetype.archetype,
          });
          return;
        }

        let classMatchups = cachedMatchupsByDeckId.get(variant.deckId) ?? [];
        if (classMatchups.length === 0) {
          try {
            const detailHtml = await fetchHsguruDeckDetail(
              variant.deckUrl,
              fetcherDeps,
              signal,
            );
            classMatchups = parseDeckClassMatchups(detailHtml);
          } catch (e) {
            if (classifyError(e, 'detail-failed') === 'aborted') throw e;
            console.warn('[popular-decks-sync] deck detail fetch failed', {
              deckId: variant.deckId,
              deckUrl: variant.deckUrl,
              name: (e as Error)?.name,
              message: (e as Error)?.message,
            });
          }
        }

        decksByTask[index] = classMatchups.length > 0
          ? { ...baseDeck, classMatchups: [...classMatchups] }
          : baseDeck;
        processed++;
        progressCb({
          phase: 'details',
          completed: processed,
          total: Math.max(totalVariants, 1),
          currentLabel: archetype.archetype,
        });
      });
    } catch (e) {
      if (classifyError(e, 'detail-failed') === 'aborted') {
        return { ok: false, error: 'aborted' };
      }
      throw e;
    }
    const decks = decksByTask.filter((deck): deck is PopularDeck => deck !== null);
    console.log(
      `[popular-decks-sync] details: ${decks.length} valid decks (skipped ${totalVariants - decks.length})`,
    );
    if (decks.length === 0) {
      console.warn('[popular-decks-sync] details yielded 0 decks — every variant rejected');
      return { ok: false, error: 'parse-failed' };
    }

    // Phase 4: persist
    progressCb({ phase: 'persist', completed: 0, total: 1 });
    const snapshot: SyncedSnapshot = {
      schemaVersion: 2,
      fetchedAt,
      decks,
    };
    try {
      await saveCache(this.deps.cacheDir, snapshot);
    } catch (e) {
      console.error('[popular-decks-sync] persist failed', {
        cacheDir: this.deps.cacheDir,
        message: (e as Error)?.message,
      });
      return { ok: false, error: classifyError(e, 'persist-failed') };
    }
    this.snapshot = snapshot;
    this.lastFetchedAt = fetchedAt;
    for (const cb of this.snapshotListeners) cb(snapshot);
    progressCb({ phase: 'persist', completed: 1, total: 1 });
    console.log(`[popular-decks-sync] done: ${decks.length} decks → ${this.deps.cacheDir}/synced.json`);
    return { ok: true, fetchedAt, count: decks.length };
  }
}

function classifyError(e: unknown, fallback: string): string {
  const err = e as { name?: string; message?: string } | null;
  if (err?.name === 'AbortError' || err?.message === 'aborted') return 'aborted';
  return fallback;
}

function abortError(): Error {
  const err = new Error('aborted');
  err.name = 'AbortError';
  return err;
}

function buildCachedClassMatchupsByDeckId(
  snapshot: SyncedSnapshot | null,
): ReadonlyMap<number, readonly PopularDeckClassMatchup[]> {
  const map = new Map<number, readonly PopularDeckClassMatchup[]>();
  for (const deck of snapshot?.decks ?? []) {
    if (!deck.classMatchups || deck.classMatchups.length === 0) continue;
    const deckId = hsguruDeckIdFromPopularDeckId(deck.id);
    if (deckId !== null) map.set(deckId, deck.classMatchups);
  }
  return map;
}

function hsguruDeckIdFromPopularDeckId(id: string): number | null {
  const match = /-(\d+)$/.exec(id);
  if (!match) return null;
  const deckId = Number(match[1]);
  return Number.isSafeInteger(deckId) ? deckId : null;
}

async function runLimitedConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const limit = Math.max(1, Math.floor(concurrency));
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await worker(items[index]!, index);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => runWorker(),
  );
  await Promise.all(workers);
}

// Re-export storage / fetcher types for IPC consumers.
export { loadCache, saveCache, type SyncedSnapshot } from './storage';
export type { FetchImpl } from './fetcher';
