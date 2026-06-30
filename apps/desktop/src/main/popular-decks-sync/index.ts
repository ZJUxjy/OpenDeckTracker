import type { PopularDeck, PopularDeckClassMatchup } from '@hdt/core';
import {
  type BrowserFetchText,
  fetchHsguruArchetypeVariants,
  fetchHsguruDeckDetail,
  fetchHsguruMeta,
  type FetchImpl,
} from './fetcher';
import {
  parseDeckClassMatchups,
  parseDeckVariants,
  parseLegendArchetypes,
  type HsguruArchetypeRow,
  type HsguruFormat,
} from './parser';
import { transformVariant, type TransformContext } from './transformer';
import { loadCache, saveCache, type SyncedSnapshot } from './storage';

export type SyncPhase = 'meta' | 'variants' | 'details' | 'persist';
export type HsguruSyncFormat = HsguruFormat;

export const DEFAULT_STANDARD_ARCHETYPE_LIMIT = 20;
export const DEFAULT_STANDARD_VARIANT_LIMIT = 5;
export const DEFAULT_WILD_ARCHETYPE_LIMIT = 100;
export const DEFAULT_WILD_VARIANT_LIMIT = 10;
export const DEFAULT_WILD_VARIANT_PER_NAME_LIMIT = 3;

const DEFAULT_SYNC_FORMATS: readonly HsguruSyncFormat[] = ['standard', 'wild'];

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
  /** Formats to sync. Default syncs both Standard and Wild. */
  formats?: readonly HsguruSyncFormat[];
  /** Wild uses a wider fetch budget because the Wild meta is flatter and changes faster. */
  wildArchetypeLimit?: number;
  wildVariantLimit?: number;
  wildVariantPerNameLimit?: number;
  /** Cap on parallel HSGuru archetype deck-list page fetches. */
  variantConcurrency?: number;
  /** Cap on parallel HSGuru deck-detail page fetches. */
  detailConcurrency?: number;
}

export type ProgressCallback = (progress: SyncProgress) => void;
export type SnapshotChangeCallback = (snapshot: SyncedSnapshot | null) => void;

interface SyncPlan {
  format: HsguruSyncFormat;
  archetypeLimit: number;
  variantLimit: number;
}

interface PlannedArchetype {
  row: HsguruArchetypeRow;
  format: HsguruSyncFormat;
  variantLimit: number;
}

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
    const syncPlans = buildSyncPlans(this.deps);
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
    progressCb({ phase: 'meta', completed: 0, total: syncPlans.length });
    const plannedArchetypes: PlannedArchetype[] = [];
    let completedMeta = 0;
    for (const plan of syncPlans) {
      let metaHtml: string;
      const metaStart = Date.now();
      try {
        metaHtml = await fetchHsguruMeta(
          fetcherDeps,
          signal,
          plan.format,
        );
      } catch (e) {
        console.error('[popular-decks-sync] meta fetch failed', {
          format: plan.format,
          elapsedMs: Date.now() - metaStart,
          name: (e as Error)?.name,
          message: (e as Error)?.message,
        });
        return { ok: false, error: classifyError(e, 'network-failed') };
      }
      console.log('[popular-decks-sync] meta fetched', {
        format: plan.format,
        elapsedMs: Date.now() - metaStart,
        bytes: metaHtml.length,
      });
      const rows = parseLegendArchetypes(metaHtml, plan.archetypeLimit);
      console.log(`[popular-decks-sync] parsed ${rows.length} ${plan.format} archetypes`);
      for (const row of rows) {
        plannedArchetypes.push({
          row,
          format: plan.format,
          variantLimit: plan.variantLimit,
        });
      }
      completedMeta++;
      progressCb({
        phase: 'meta',
        completed: completedMeta,
        total: syncPlans.length,
        currentLabel: plan.format,
      });
    }
    if (plannedArchetypes.length === 0) {
      console.warn('[popular-decks-sync] meta parse yielded 0 archetypes (DOM changed?)');
      return { ok: false, error: 'parse-failed' };
    }

    // Phase 2: variants (one round-trip set per archetype)
    const variantsByArchetypeResults: Array<{
      archetype: HsguruArchetypeRow;
      format: HsguruSyncFormat;
      variants: ReturnType<typeof parseDeckVariants>;
    } | null> = new Array(plannedArchetypes.length).fill(null);
    let completedArchetypes = 0;
    progressCb({
      phase: 'variants',
      completed: 0,
      total: plannedArchetypes.length,
      ...(plannedArchetypes[0] ? { currentLabel: plannedArchetypes[0].row.archetype } : {}),
    });
    try {
      await runLimitedConcurrency(plannedArchetypes, variantConcurrency, async (planned, index) => {
        if (signal.aborted) throw abortError();
        let result: { html: string; url: string } | null;
        const variantStart = Date.now();
        try {
          result = await fetchHsguruArchetypeVariants(
            planned.row.archetype,
            fetcherDeps,
            signal,
            planned.format,
          );
        } catch (e) {
          console.error('[popular-decks-sync] variants fetch failed', {
            archetype: planned.row.archetype,
            format: planned.format,
            elapsedMs: Date.now() - variantStart,
            name: (e as Error)?.name,
            message: (e as Error)?.message,
          });
          throw e;
        }
        const variants = result ? parseDeckVariants(result.html, planned.variantLimit) : [];
        console.log(
          `[popular-decks-sync] variants ${completedArchetypes + 1}/${plannedArchetypes.length} ${planned.format} ${planned.row.archetype}: ${variants.length} decks (${Date.now() - variantStart}ms)`,
        );
        variantsByArchetypeResults[index] = {
          archetype: planned.row,
          format: planned.format,
          variants,
        };
        completedArchetypes++;
        progressCb({
          phase: 'variants',
          completed: completedArchetypes,
          total: plannedArchetypes.length,
          currentLabel: planned.row.archetype,
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
      completed: plannedArchetypes.length,
      total: plannedArchetypes.length,
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
    const persistedDecks = applyWildVariantPolicy(
      decks,
      this.deps.wildVariantPerNameLimit ?? DEFAULT_WILD_VARIANT_PER_NAME_LIMIT,
    );
    if (syncPlans.some((plan) => plan.format === 'wild')) {
      const wildCount = persistedDecks.filter((deck) => deck.format === 'Wild').length;
      if (wildCount < 200) {
        console.warn('[popular-decks-sync] fewer than 200 Wild decks collected', {
          wildCount,
          archetypeLimit: this.deps.wildArchetypeLimit ?? DEFAULT_WILD_ARCHETYPE_LIMIT,
          variantLimit: this.deps.wildVariantLimit ?? DEFAULT_WILD_VARIANT_LIMIT,
        });
      }
    }

    // Phase 4: persist
    progressCb({ phase: 'persist', completed: 0, total: 1 });
    const snapshot: SyncedSnapshot = {
      schemaVersion: 2,
      fetchedAt,
      decks: persistedDecks,
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
    console.log(`[popular-decks-sync] done: ${persistedDecks.length} decks → ${this.deps.cacheDir}/synced.json`);
    return { ok: true, fetchedAt, count: persistedDecks.length };
  }
}

function buildSyncPlans(deps: SyncDeps): SyncPlan[] {
  const formats = deps.formats && deps.formats.length > 0
    ? deps.formats
    : DEFAULT_SYNC_FORMATS;
  const seen = new Set<HsguruSyncFormat>();
  const plans: SyncPlan[] = [];
  for (const format of formats) {
    if (seen.has(format)) continue;
    seen.add(format);
    if (format === 'wild') {
      plans.push({
        format,
        archetypeLimit: deps.wildArchetypeLimit ?? DEFAULT_WILD_ARCHETYPE_LIMIT,
        variantLimit: deps.wildVariantLimit ?? DEFAULT_WILD_VARIANT_LIMIT,
      });
    } else {
      plans.push({
        format,
        archetypeLimit: deps.archetypeLimit ?? DEFAULT_STANDARD_ARCHETYPE_LIMIT,
        variantLimit: deps.variantLimit ?? DEFAULT_STANDARD_VARIANT_LIMIT,
      });
    }
  }
  return plans;
}

export function applyWildVariantPolicy(
  decks: readonly PopularDeck[],
  perNameLimit = DEFAULT_WILD_VARIANT_PER_NAME_LIMIT,
): PopularDeck[] {
  const limit = Math.max(1, Math.floor(perNameLimit));
  const wildByName = new Map<string, Array<{ deck: PopularDeck; index: number }>>();
  decks.forEach((deck, index) => {
    if (deck.format !== 'Wild') return;
    const key = normalizeDeckName(deck.name);
    const group = wildByName.get(key) ?? [];
    group.push({ deck, index });
    wildByName.set(key, group);
  });

  const keptWildDecks = new Set<PopularDeck>();
  for (const group of wildByName.values()) {
    group
      .slice()
      .sort((a, b) =>
        b.deck.gamesCount - a.deck.gamesCount ||
        b.deck.winratePercent - a.deck.winratePercent ||
        a.index - b.index,
      )
      .slice(0, limit)
      .forEach(({ deck }) => keptWildDecks.add(deck));
  }

  return decks.filter((deck) => deck.format !== 'Wild' || keptWildDecks.has(deck));
}

function normalizeDeckName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
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
