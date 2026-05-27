import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  Format,
  HeroClass,
  MatchupHeroClass,
  PopularDeck,
  PopularDeckArchetype,
} from '@hdt/core';

export const SYNCED_FILENAME = 'synced.json';
export const SYNCED_TMP_FILENAME = 'synced.json.tmp';
export const SYNCED_SCHEMA_VERSION = 2;
export type SyncedSchemaVersion = 1 | 2;

export interface SyncedSnapshot {
  schemaVersion: SyncedSchemaVersion;
  fetchedAt: string;
  decks: PopularDeck[];
}

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
const MATCHUP_HERO_CLASS_VALUES: ReadonlySet<string> = new Set<MatchupHeroClass>([
  'DEATHKNIGHT', 'DEMONHUNTER', 'DRUID', 'HUNTER', 'MAGE', 'PALADIN',
  'PRIEST', 'ROGUE', 'SHAMAN', 'WARLOCK', 'WARRIOR',
]);

function isPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isClassMatchup(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['opponentClass'] === 'string'
    && MATCHUP_HERO_CLASS_VALUES.has(v['opponentClass'] as string)
    && isPercent(v['winratePercent'])
    && isNonNegativeInteger(v['gamesCount'])
    && isPercent(v['popularityPercent'])
  );
}

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
    && (
      v['classMatchups'] === undefined ||
      (Array.isArray(v['classMatchups']) && v['classMatchups'].every(isClassMatchup))
    )
  );
}

/**
 * Reads the synced snapshot from `<dir>/synced.json`. Returns `null`
 * when the file is absent, malformed JSON, has an unsupported schema,
 * or contains any deck that fails the `PopularDeck` shape check. The
 * intent is that ANY corruption falls back silently to the bundled
 * seed rather than surfacing an error to the user.
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
  if (obj['schemaVersion'] !== 1 && obj['schemaVersion'] !== SYNCED_SCHEMA_VERSION) return null;
  if (typeof obj['fetchedAt'] !== 'string') return null;
  const decks = obj['decks'];
  if (!Array.isArray(decks) || decks.length === 0) return null;
  if (!decks.every(isPopularDeck)) return null;
  return {
    schemaVersion: obj['schemaVersion'] as SyncedSchemaVersion,
    fetchedAt: obj['fetchedAt'],
    decks: decks as PopularDeck[],
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
