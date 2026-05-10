import type { DeckSyncResult } from './deck-sync-service';

export type LiveDeckSyncSource = 'live' | 'unavailable' | 'not-ready' | 'error';

export interface LiveDeckSyncResult {
  ok: boolean;
  source: LiveDeckSyncSource;
  synced: number;
  skippedNonCollectible: number;
  skippedUnknownClass: number;
  error?: string;
  startedAt: number;
  finishedAt: number;
}

export interface DeckSyncService {
  syncOnce(): Promise<DeckSyncResult>;
}

export interface DeckSyncHost {
  /**
   * Trigger a live sync. Concurrent callers share the same in-flight
   * promise (single-flight). Returns a structured status; HearthMirror
   * unavailable resolves with `ok: false` rather than rejecting.
   */
  syncFromLive(): Promise<LiveDeckSyncResult>;
  /**
   * Install the real sync service once dependencies (CardDb, etc.) are
   * ready. Before this is called, `syncFromLive()` resolves with
   * `source: 'not-ready'`. Idempotent: a second install replaces the
   * existing service so callers always observe the latest dependency
   * graph.
   */
  setService(service: DeckSyncService | null): void;
}

export interface DeckSyncHostOptions {
  service?: DeckSyncService | null;
  now?: () => number;
}

export function createDeckSyncHost(options: DeckSyncHostOptions = {}): DeckSyncHost {
  const now = options.now ?? Date.now;
  let service: DeckSyncService | null = options.service ?? null;
  let inFlight: Promise<LiveDeckSyncResult> | null = null;

  async function runOnce(): Promise<LiveDeckSyncResult> {
    const startedAt = now();
    const installed = service;
    if (installed === null) {
      return {
        ok: false,
        source: 'not-ready',
        synced: 0,
        skippedNonCollectible: 0,
        skippedUnknownClass: 0,
        startedAt,
        finishedAt: now(),
      };
    }
    try {
      const inner = await installed.syncOnce();
      const finishedAt = now();
      const result: LiveDeckSyncResult = {
        ok: inner.source === 'live',
        source: inner.source,
        synced: inner.synced,
        skippedNonCollectible: inner.skippedNonCollectible,
        skippedUnknownClass: inner.skippedUnknownClass,
        startedAt,
        finishedAt,
      };
      if (inner.error !== undefined) result.error = inner.error;
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[deck-sync-host] unexpected error', err);
      return {
        ok: false,
        source: 'error',
        synced: 0,
        skippedNonCollectible: 0,
        skippedUnknownClass: 0,
        error: message,
        startedAt,
        finishedAt: now(),
      };
    }
  }

  return {
    syncFromLive(): Promise<LiveDeckSyncResult> {
      if (inFlight !== null) return inFlight;
      const p = runOnce().finally(() => {
        inFlight = null;
      });
      inFlight = p;
      return p;
    },
    setService(next): void {
      service = next;
    },
  };
}
