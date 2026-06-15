import { describe, expect, it } from 'vitest';
import {
  BULK_DOWNLOAD_PROGRESS_SCHEMA_VERSION,
  type BulkDownloadProgress,
  type BulkDownloadStatus,
  type BulkDownloadType,
  type StartBulkDownloadResult,
} from './index';

describe('card-image-download public exports', () => {
  it('exports the schema version constant', () => {
    expect(BULK_DOWNLOAD_PROGRESS_SCHEMA_VERSION).toBe(1);
  });

  it('constructs valid progress and status values', () => {
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

    const started: StartBulkDownloadResult = {
      ok: true,
      status: {
        state: 'idle',
        progress: { completed: 0, total: 0, failed: 0, currentCardId: null },
        stats: progress.stats,
      },
    };
    expect(started.ok).toBe(true);

    const alreadyRunning: StartBulkDownloadResult = {
      ok: false,
      error: 'already-running',
    };
    expect(alreadyRunning.ok).toBe(false);
  });
});
