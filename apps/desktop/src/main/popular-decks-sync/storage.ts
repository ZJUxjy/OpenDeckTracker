import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Format, HeroClass, PopularDeck, PopularDeckArchetype } from '@hdt/core';
import type {
  PopularDeckSourceId,
  PopularDeckSourceSnapshot,
  PopularDeckSourceStatus,
} from './provider-types';

export const SYNCED_FILENAME = 'synced.json';
export const SYNCED_TMP_FILENAME = 'synced.json.tmp';
export const SYNCED_SCHEMA_VERSION = 2;

export interface SyncedSnapshotV1 {
  schemaVersion: 1;
  fetchedAt: string;
  decks: PopularDeck[];
}

export interface SyncedSnapshotV2 {
  schemaVersion: 2;
  fetchedAt: string;
  decks: PopularDeck[];
  sources: PopularDeckSourceSnapshot[];
}

export type SyncedSnapshot = SyncedSnapshotV1 | SyncedSnapshotV2;

const SOURCE_ID_VALUES: ReadonlySet<string> = new Set<PopularDeckSourceId>([
  'hsguru',
  'hsreplay',
  'lushi',
]);

const SOURCE_STATUS_VALUES: ReadonlySet<string> = new Set<PopularDeckSourceStatus>([
  'ok',
  'failed',
  'unsupported',
  'disabled',
]);

const HERO_CLASS_VALUES: ReadonlySet<string> = new Set<HeroClass>([
  'DEATHKNIGHT', 'DEMONHUNTER', 'DRUID', 'HUNTER', 'MAGE', 'PALADIN',
  'PRIEST', 'ROGUE', 'SHAMAN', 'WARLOCK', 'WARRIOR', 'NEUTRAL',
]);
const FORMAT_VALUES: ReadonlySet<string> = new Set<Format>([
  'Standard', 'Wild', 'Classic', 'Twist',
]);
const ARCHETYPE_VALUES: ReadonlySet<string> = new Set<PopularDeckArchetype>([
  'Aggro', 'Midrange', 'Control', 'Combo', 'Tempo', 'Ramp',
]);

function isPopularDeck(value: unknown): value is PopularDeck {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string'
    && typeof v['name'] === 'string'
    && typeof v['class'] === 'string' && HERO_CLASS_VALUES.has(v['class'] as string)
    && typeof v['format'] === 'string' && FORMAT_VALUES.has(v['format'] as string)
    && typeof v['archetype'] === 'string' && ARCHETYPE_VALUES.has(v['archetype'] as string)
    && typeof v['deckstring'] === 'string'
    && typeof v['winratePercent'] === 'number'
    && typeof v['gamesCount'] === 'number'
    && typeof v['author'] === 'string'
    && typeof v['updatedAt'] === 'string'
  );
}

function isPopularDeckSourceSnapshot(value: unknown): value is PopularDeckSourceSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v['id'] !== 'string' || !SOURCE_ID_VALUES.has(v['id'])) return false;
  if (typeof v['label'] !== 'string') return false;
  if (typeof v['enabled'] !== 'boolean') return false;
  if (typeof v['status'] !== 'string' || !SOURCE_STATUS_VALUES.has(v['status'])) return false;
  if ('reason' in v && typeof v['reason'] !== 'string') return false;
  if ('fetchedAt' in v && typeof v['fetchedAt'] !== 'string') return false;
  if ('deckCount' in v && typeof v['deckCount'] !== 'number') return false;
  if ('error' in v && typeof v['error'] !== 'string') return false;
  return true;
}

/**
 * Reads the synced snapshot from `<dir>/synced.json`. Returns `null`
 * when the file is absent, malformed JSON, has an unsupported schema,
 * contains any deck that fails the `PopularDeck` shape check, or has
 * invalid schema version 2 source diagnostics. The intent is that ANY
 * corruption falls back silently to the bundled seed rather than
 * surfacing an error to the user.
 */
export async function loadCache(dir: string): Promise<SyncedSnapshot | null> {
  const path = join(dir, SYNCED_FILENAME);
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (obj['schemaVersion'] !== 1 && obj['schemaVersion'] !== 2) return null;
  if (typeof obj['fetchedAt'] !== 'string') return null;
  const decks = obj['decks'];
  if (!Array.isArray(decks) || decks.length === 0) return null;
  if (!decks.every(isPopularDeck)) return null;

  if (obj['schemaVersion'] === 1) {
    return {
      schemaVersion: 1,
      fetchedAt: obj['fetchedAt'],
      decks: decks as PopularDeck[],
    };
  }

  const sources = obj['sources'];
  if (!Array.isArray(sources) || !sources.every(isPopularDeckSourceSnapshot)) return null;
  return {
    schemaVersion: SYNCED_SCHEMA_VERSION,
    fetchedAt: obj['fetchedAt'],
    decks: decks as PopularDeck[],
    sources: sources as PopularDeckSourceSnapshot[],
  };
}

/**
 * Writes a snapshot to `<dir>/synced.json` atomically: data is staged
 * to `synced.json.tmp` first then renamed into place. A crash between
 * the write and rename leaves the previous `synced.json` untouched.
 */
export async function saveCache(dir: string, snapshot: SyncedSnapshot): Promise<void> {
  await mkdir(dir, { recursive: true });
  const tmpPath = join(dir, SYNCED_TMP_FILENAME);
  const finalPath = join(dir, SYNCED_FILENAME);
  await writeFile(tmpPath, JSON.stringify(snapshot, null, 2), 'utf-8');
  await rename(tmpPath, finalPath);
}
