import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';

export async function loadCollectibleCardIds(locale = 'zhCN'): Promise<string[]> {
  const relativeJsonPath = `data/cards/generated/cards.collectible.${locale}.json`;
  const here = dirname(fileURLToPath(import.meta.url));
  const appPath = typeof app?.getAppPath === 'function' ? app.getAppPath() : null;
  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : null;

  const candidates = [
    ...(resourcesPath ? [resolve(resourcesPath, relativeJsonPath)] : []),
    resolve(here, '../../../../..', relativeJsonPath),
    resolve(process.cwd(), relativeJsonPath),
    ...(appPath
      ? [resolve(appPath, relativeJsonPath), resolve(appPath, '../..', relativeJsonPath)]
      : []),
  ];

  let chosen: string | null = null;
  for (const p of candidates) {
    if (existsSync(p)) {
      chosen = p;
      break;
    }
  }
  if (!chosen) {
    throw new Error(`collectible card data not found; tried ${candidates.join(', ')}`);
  }

  const raw = await readFile(chosen, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`collectible card data must be an array: ${chosen}`);
  }
  const ids = new Set<string>();
  for (const row of parsed as Array<{ id?: unknown }>) {
    if (typeof row.id === 'string' && row.id.length > 0) {
      ids.add(row.id);
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}
