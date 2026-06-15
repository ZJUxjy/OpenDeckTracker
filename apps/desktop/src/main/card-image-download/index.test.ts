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
