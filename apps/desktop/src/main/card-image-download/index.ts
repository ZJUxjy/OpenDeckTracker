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

export type StartBulkDownloadResult =
  | {
      ok: true;
      status: BulkDownloadStatus;
    }
  | {
      ok: false;
      error: string;
    };
