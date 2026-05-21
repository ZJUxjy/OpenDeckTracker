import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';
import { loadCards, type CardDb } from '@hdt/hearthdb';

const DEFAULT_CARDS_LOCALE = 'enUS';
type CardsLocale = string;

function relativeJson(locale: CardsLocale): string {
  return `data/cards/generated/cards.all.${locale}.json`;
}

/**
 * Locate the cards JSON. In dev, main bundle lives at
 * `apps/desktop/out/main/index.js` and CWD is `apps/desktop/`; in production
 * (NSIS install), the file is shipped under the app's resources dir.
 *
 * Try a few likely locations and return the first that exists.
 */
function resolveCardsJsonPath(locale: CardsLocale): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const relativeJsonPath = relativeJson(locale);
  const appPath = typeof app?.getAppPath === 'function' ? app.getAppPath() : null;
  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : null;
  const candidates = [
    // packaged: extraResources ships data/cards/generated under resources/
    ...(resourcesPath ? [resolve(resourcesPath, relativeJsonPath)] : []),
    // dev: from out/main go up 3 levels to monorepo root
    resolve(here, '../../../..', relativeJsonPath),
    // legacy / explicit cwd at repo root
    resolve(process.cwd(), relativeJsonPath),
    // fallback to electron app path (production / packaged)
    ...(appPath
      ? [
          resolve(appPath, relativeJsonPath),
          resolve(appPath, '../..', relativeJsonPath),
        ]
      : []),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  // No candidate exists yet (e.g. dev tree without generated JSON, or
  // a broken install). Return the first candidate so the loader emits a
  // pinpointed ENOENT — in packaged builds that's `process.resourcesPath`,
  // in dev it's the monorepo root.
  return candidates[0]!;
}

const dbPromises = new Map<string, Promise<CardDb>>();

export function ensureCardDb(locale: CardsLocale = DEFAULT_CARDS_LOCALE): Promise<CardDb> {
  const normalizedLocale = locale || DEFAULT_CARDS_LOCALE;
  const existing = dbPromises.get(normalizedLocale);
  if (existing) return existing;

  const dbPromise = loadCardDb(normalizedLocale);
  dbPromises.set(normalizedLocale, dbPromise);
  return dbPromise;
}

function loadCardDb(locale: CardsLocale): Promise<CardDb> {
  const jsonPath = resolveCardsJsonPath(locale);
  const dbPromise = loadCards(jsonPath).catch((e: Error) => {
    if (locale !== DEFAULT_CARDS_LOCALE) {
      console.error(
        `[cards] failed to load cards.all.${locale}.json, falling back to ${DEFAULT_CARDS_LOCALE}:`,
        e.message,
      );
      return ensureCardDb(DEFAULT_CARDS_LOCALE);
    }

    console.error(`[cards] failed to load cards.all.${locale}.json:`, e.message);
    console.error('[cards] tried path:', jsonPath);
    console.error(
      "[cards] Run 'pnpm cards:convert' from the repo root to generate the data, then restart the app.",
    );
    throw e;
  });
  return dbPromise;
}

export function clearCardDbCacheForTests(): void {
  dbPromises.clear();
}
