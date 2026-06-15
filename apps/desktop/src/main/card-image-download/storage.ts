import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BULK_DOWNLOAD_PROGRESS_SCHEMA_VERSION,
  type BulkDownloadProgress,
} from './index';

export const PROGRESS_FILENAME = 'bulk-download-progress.json';
export const PROGRESS_TMP_FILENAME = 'bulk-download-progress.json.tmp';

export async function loadProgress(cacheRoot: string): Promise<BulkDownloadProgress | null> {
  const filePath = path.join(cacheRoot, PROGRESS_FILENAME);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isBulkDownloadProgress(parsed)) return null;
  return parsed;
}

export async function saveProgress(
  cacheRoot: string,
  progress: BulkDownloadProgress,
): Promise<void> {
  await mkdir(cacheRoot, { recursive: true });
  const tmpPath = path.join(cacheRoot, PROGRESS_TMP_FILENAME);
  const finalPath = path.join(cacheRoot, PROGRESS_FILENAME);
  await writeFile(tmpPath, JSON.stringify(progress, null, 2), 'utf-8');
  await rename(tmpPath, finalPath);
}

function isBulkDownloadProgress(value: unknown): value is BulkDownloadProgress {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v['schemaVersion'] !== BULK_DOWNLOAD_PROGRESS_SCHEMA_VERSION) return false;
  if (!isDateString(v['startedAt'])) return false;
  if (!isDateString(v['updatedAt'])) return false;
  if ('stoppedAt' in v && !isDateString(v['stoppedAt'])) return false;
  if (!isStringArray(v['cardIds'])) return false;
  if (!isStringArray(v['completedCardIds'])) return false;
  if (!isStringArray(v['failedCardIds'])) return false;
  if (typeof v['paused'] !== 'boolean') return false;
  if (!isStringArray(v['types'])) return false;
  if (v['types'].length === 0) return false;
  if (!v['types'].every((t) => t === 'render' || t === 'tile')) return false;
  if (!isStats(v['stats'])) return false;
  return true;
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isStats(value: unknown): value is BulkDownloadProgress['stats'] {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    isNonNegativeInteger(s['downloadedRenders']) &&
    isNonNegativeInteger(s['downloadedTiles']) &&
    isNonNegativeInteger(s['skippedRenders']) &&
    isNonNegativeInteger(s['skippedTiles']) &&
    isNonNegativeInteger(s['failed'])
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
