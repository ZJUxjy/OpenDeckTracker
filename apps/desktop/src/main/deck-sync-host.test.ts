import { describe, expect, it, vi } from 'vitest';
import type { DeckSyncResult } from './deck-sync-service';
import { createDeckSyncHost, type DeckSyncService } from './deck-sync-host';

function makeService(syncOnce: () => Promise<DeckSyncResult>): DeckSyncService {
  return { syncOnce: vi.fn(syncOnce) };
}

describe('deck-sync-host', () => {
  it('returns unavailable without mutating store when getLiveDecks resolves null', async () => {
    const host = createDeckSyncHost({
      service: makeService(async () => ({
        source: 'unavailable',
        synced: 0,
        skippedNonCollectible: 0,
        skippedUnknownClass: 0,
      })),
    });

    const result = await host.syncFromLive();

    expect(result.source).toBe('unavailable');
    expect(result.ok).toBe(false);
    expect(result.synced).toBe(0);
  });

  it('reports source=live and ok=true on a successful sync', async () => {
    const host = createDeckSyncHost({
      service: makeService(async () => ({
        source: 'live',
        synced: 2,
        skippedNonCollectible: 0,
        skippedUnknownClass: 0,
      })),
    });

    const result = await host.syncFromLive();

    expect(result.ok).toBe(true);
    expect(result.source).toBe('live');
    expect(result.synced).toBe(2);
    expect(result.finishedAt).toBeGreaterThanOrEqual(result.startedAt);
  });

  it('coalesces concurrent sync requests into a single underlying call', async () => {
    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });
    const syncOnce = vi.fn(async (): Promise<DeckSyncResult> => {
      await gate;
      return {
        source: 'live',
        synced: 1,
        skippedNonCollectible: 0,
        skippedUnknownClass: 0,
      };
    });
    const host = createDeckSyncHost({ service: { syncOnce } });

    const a = host.syncFromLive();
    const b = host.syncFromLive();
    resolve();
    const [ra, rb] = await Promise.all([a, b]);

    expect(syncOnce).toHaveBeenCalledTimes(1);
    expect(ra).toBe(rb);
  });

  it('reports not-ready before the sync service is installed', async () => {
    const host = createDeckSyncHost();

    const result = await host.syncFromLive();

    expect(result.ok).toBe(false);
    expect(result.source).toBe('not-ready');
    expect(result.synced).toBe(0);
  });

  it('switches to live once the service is installed', async () => {
    const host = createDeckSyncHost();
    const first = await host.syncFromLive();
    expect(first.source).toBe('not-ready');

    host.setService(
      makeService(async () => ({
        source: 'live',
        synced: 3,
        skippedNonCollectible: 0,
        skippedUnknownClass: 0,
      })),
    );

    const second = await host.syncFromLive();
    expect(second.source).toBe('live');
    expect(second.synced).toBe(3);
  });

  it('surfaces a service error as source=error with ok=false', async () => {
    const host = createDeckSyncHost({
      service: makeService(async () => ({
        source: 'error',
        synced: 0,
        skippedNonCollectible: 0,
        skippedUnknownClass: 0,
        error: 'boom',
      })),
    });

    const result = await host.syncFromLive();

    expect(result.ok).toBe(false);
    expect(result.source).toBe('error');
    expect(result.error).toBe('boom');
  });
});
