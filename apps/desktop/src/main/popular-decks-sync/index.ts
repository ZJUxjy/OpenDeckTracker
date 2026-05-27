import type { PopularDeck, PopularDeckClassMatchup } from '@hdt/core';
import {
  fetchHsguruArchetypeVariants,
  fetchHsguruDeckDetail,
  fetchHsguruMeta,
  type FetchImpl,
  ARCHETYPE_DELAY_MS,
} from './fetcher';
import { parseDeckClassMatchups, parseDeckVariants, parseLegendArchetypes } from './parser';
import { transformVariant, type TransformContext } from './transformer';
import { loadCache, saveCache, type SyncedSnapshot } from './storage';

export type SyncPhase = 'meta' | 'variants' | 'transform' | 'persist';

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
  /** Override for tests; default uses real setTimeout-backed delay. */
  delay?: (ms: number) => Promise<void>;
  now?: () => Date;
  /** Cap on archetypes/variants per archetype. */
  archetypeLimit?: number;
  variantLimit?: number;
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
    const fetchedAt = now().toISOString();
    console.log('[popular-decks-sync] start', { fetchedAt, cacheDir: this.deps.cacheDir });

    // Phase 1: meta
    progressCb({ phase: 'meta', completed: 0, total: 1 });
    let metaHtml: string;
    const metaStart = Date.now();
    try {
      metaHtml = await fetchHsguruMeta(
        { fetchImpl: this.deps.fetchImpl, delay },
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
    const variantsByArchetype: Array<{
      archetype: typeof archetypes[number];
      variants: ReturnType<typeof parseDeckVariants>;
    }> = [];
    for (let i = 0; i < archetypes.length; i++) {
      if (signal.aborted) return { ok: false, error: 'aborted' };
      const archetype = archetypes[i]!;
      progressCb({
        phase: 'variants',
        completed: i,
        total: archetypes.length,
        currentLabel: archetype.archetype,
      });
      let result: { html: string; url: string } | null;
      const variantStart = Date.now();
      try {
        result = await fetchHsguruArchetypeVariants(
          archetype.archetype,
          { fetchImpl: this.deps.fetchImpl, delay },
          signal,
        );
      } catch (e) {
        console.error('[popular-decks-sync] variants fetch failed', {
          archetype: archetype.archetype,
          elapsedMs: Date.now() - variantStart,
          name: (e as Error)?.name,
          message: (e as Error)?.message,
        });
        return { ok: false, error: classifyError(e, 'network-failed') };
      }
      const variants = result ? parseDeckVariants(result.html, variantLimit) : [];
      console.log(
        `[popular-decks-sync] variants ${i + 1}/${archetypes.length} ${archetype.archetype}: ${variants.length} decks (${Date.now() - variantStart}ms)`,
      );
      variantsByArchetype.push({ archetype, variants });
      if (i < archetypes.length - 1) await delay(ARCHETYPE_DELAY_MS);
    }
    progressCb({
      phase: 'variants',
      completed: archetypes.length,
      total: archetypes.length,
    });

    // Phase 3: transform
    const decks: PopularDeck[] = [];
    const totalVariants = variantsByArchetype.reduce((s, x) => s + x.variants.length, 0);
    let processed = 0;
    progressCb({ phase: 'transform', completed: 0, total: Math.max(totalVariants, 1) });
    for (const { archetype, variants } of variantsByArchetype) {
      for (const variant of variants) {
        let classMatchups: readonly PopularDeckClassMatchup[] = [];
        try {
          const detailHtml = await fetchHsguruDeckDetail(
            variant.deckUrl,
            { fetchImpl: this.deps.fetchImpl, delay },
            signal,
          );
          classMatchups = parseDeckClassMatchups(detailHtml);
        } catch (e) {
          if (classifyError(e, 'detail-failed') === 'aborted') {
            return { ok: false, error: 'aborted' };
          }
          console.warn('[popular-decks-sync] deck detail fetch failed', {
            deckId: variant.deckId,
            deckUrl: variant.deckUrl,
            name: (e as Error)?.name,
            message: (e as Error)?.message,
          });
        }
        const deck = transformVariant(
          archetype,
          variant,
          fetchedAt,
          { findByDbfId: lookup },
          classMatchups,
        );
        if (deck) decks.push(deck);
        processed++;
        progressCb({
          phase: 'transform',
          completed: processed,
          total: Math.max(totalVariants, 1),
          currentLabel: archetype.archetype,
        });
      }
    }
    console.log(
      `[popular-decks-sync] transform: ${decks.length} valid decks (skipped ${totalVariants - decks.length})`,
    );
    if (decks.length === 0) {
      console.warn('[popular-decks-sync] transform yielded 0 decks — every variant rejected');
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

// Re-export storage / fetcher types for IPC consumers.
export { loadCache, saveCache, type SyncedSnapshot } from './storage';
export type { FetchImpl } from './fetcher';
