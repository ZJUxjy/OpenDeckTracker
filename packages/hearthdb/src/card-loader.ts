import fs from 'node:fs/promises';
import { CardDb } from './card-db';
import type { CardDef } from './card-defs';

export async function loadCards(jsonPath: string): Promise<CardDb> {
  const text = await fs.readFile(jsonPath, 'utf8');

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(
      `loadCards: failed to parse JSON at ${jsonPath}: ${(e as Error).message}`,
    );
  }

  if (!Array.isArray(raw)) {
    throw new Error(`loadCards: expected JSON array at ${jsonPath}, got ${typeof raw}`);
  }

  return new CardDb(raw as readonly CardDef[]);
}
