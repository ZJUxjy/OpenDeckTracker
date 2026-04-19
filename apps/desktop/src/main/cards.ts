import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';
import { loadCards, type CardDb } from '@hdt/hearthdb';

const RELATIVE_JSON = 'data/cards/cards.collectible.enUS.json';

/**
 * Locate the cards JSON. In dev, main bundle lives at
 * `apps/desktop/out/main/index.js` and CWD is `apps/desktop/`; in production
 * (NSIS install), the file is shipped under the app's resources dir.
 *
 * Try a few likely locations and return the first that exists.
 */
function resolveCardsJsonPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // dev: from out/main go up 3 levels to monorepo root
    resolve(here, '../../../..', RELATIVE_JSON),
    // legacy / explicit cwd at repo root
    resolve(process.cwd(), RELATIVE_JSON),
    // fallback to electron app path (production / packaged)
    resolve(app.getAppPath(), RELATIVE_JSON),
    resolve(app.getAppPath(), '../..', RELATIVE_JSON),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  // Fall back to the dev path even if missing — loader will throw a clear ENOENT
  return candidates[0]!;
}

let dbPromise: Promise<CardDb> | null = null;

export function ensureCardDb(): Promise<CardDb> {
  if (!dbPromise) {
    const jsonPath = resolveCardsJsonPath();
    dbPromise = loadCards(jsonPath);
    dbPromise.catch((e: Error) => {
      console.error('[cards] failed to load cards.collectible.enUS.json:', e.message);
      console.error('[cards] tried path:', jsonPath);
      console.error(
        "[cards] Run 'pnpm cards:download' from the repo root to fetch the data, then restart the app.",
      );
    });
  }
  return dbPromise;
}
