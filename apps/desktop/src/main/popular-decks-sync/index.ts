import type { PopularDeck } from '@hdt/core';
import { createPopularDeckProviders } from './provider-registry';
import {
  PopularDeckProviderError,
  type PopularDeckProvider,
  type PopularDeckProviderContext,
  type PopularDeckSourceSnapshot,
  type ProgressCallback,
  type SyncProgress,
  type SyncPhase,
} from './provider-types';
import {
  loadCache,
  saveCache,
  type SyncedSnapshot,
  type SyncedSnapshotV2,
} from './storage';
import type { FetchImpl } from './fetcher';
import type { TransformContext } from './transformer';

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
  /** Override for tests; default uses the built-in provider registry. */
  providers?: PopularDeckProvider[];
}

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

    const providers = this.deps.providers ?? createPopularDeckProviders();
    const decks: PopularDeck[] = [];
    const sources: PopularDeckSourceSnapshot[] = [];
    let enabledSupportedProviders = 0;
    let firstFailure: string | null = null;

    for (const provider of providers) {
      const providerStatus = provider.getStatus();
      const enabled = provider.defaultEnabled;

      if (providerStatus.status === 'unsupported') {
        sources.push({
          id: provider.id,
          label: provider.label,
          enabled: false,
          status: 'unsupported',
          reason: providerStatus.reason,
        });
        continue;
      }

      if (!enabled) {
        sources.push({
          id: provider.id,
          label: provider.label,
          enabled: false,
          status: 'disabled',
        });
        continue;
      }

      enabledSupportedProviders++;
      const context: PopularDeckProviderContext = {
        fetchImpl: this.deps.fetchImpl,
        delay,
        findByDbfId: lookup,
        fetchedAt,
        archetypeLimit,
        variantLimit,
        progressCb,
        signal,
      };

      try {
        const result = await provider.sync(context);
        decks.push(...result.decks);
        sources.push(result.source);
      } catch (e) {
        const error = classifyError(e, 'sync-failed');
        firstFailure ??= error;
        sources.push({
          id: provider.id,
          label: provider.label,
          enabled: true,
          status: 'failed',
          error,
        });
        if (error === 'aborted') return { ok: false, error };
      }
    }

    if (enabledSupportedProviders === 0) {
      return { ok: false, error: 'no-enabled-providers' };
    }

    if (decks.length === 0) {
      return { ok: false, error: firstFailure ?? 'parse-failed' };
    }

    progressCb({ phase: 'persist', completed: 0, total: 1 });
    const snapshot: SyncedSnapshotV2 = {
      schemaVersion: 2,
      fetchedAt,
      decks,
      sources,
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
  if (e instanceof PopularDeckProviderError) return e.code;
  const err = e as { name?: string; message?: string } | null;
  if (err?.name === 'AbortError' || err?.message === 'aborted') return 'aborted';
  return fallback;
}

// Re-export storage / fetcher types for IPC consumers.
export { loadCache, saveCache, type SyncedSnapshot } from './storage';
export type { FetchImpl } from './fetcher';
export type { SyncProgress, SyncPhase } from './provider-types';
