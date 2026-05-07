/**
 * Cross-checks every catalog entry against the live hsdata-generated
 * collectible-card pool. Catches catalog drift when a Standard
 * rotation removes a card or when a typo lands in a `sourceCardId`.
 *
 * Skips automatically when the generated JSON is not present (CI
 * builds that don't ship card data).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STANDARD_SET_CODES } from '@hdt/hearthdb';
import { EFFECT_CATALOG } from './index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../../../..');
const cardsJsonPath = resolve(
  repoRoot,
  'data/cards/generated/cards.collectible.enUS.json',
);

const skip = !existsSync(cardsJsonPath);
const describeIfData = skip ? describe.skip : describe;

describeIfData('EFFECT_CATALOG vs hsdata', () => {
  interface CardJsonEntry {
    id: string;
    set?: string;
    name?: string;
  }
  const collectible = JSON.parse(
    readFileSync(cardsJsonPath, 'utf-8'),
  ) as CardJsonEntry[];
  const byId = new Map<string, CardJsonEntry>(collectible.map((c) => [c.id, c]));

  it('every sourceCardId is in the collectible card pool', () => {
    for (const def of EFFECT_CATALOG) {
      expect(byId.has(def.sourceCardId), `${def.id} → ${def.sourceCardId}`).toBe(true);
    }
  });

  it('every STANDARD entry resolves to a Standard-legal set', () => {
    const standardSets = new Set<string>(STANDARD_SET_CODES);
    for (const def of EFFECT_CATALOG) {
      if (def.mode !== 'STANDARD') continue;
      const card = byId.get(def.sourceCardId);
      expect(card?.set, `${def.id} card def`).toBeDefined();
      expect(standardSets.has(card!.set ?? ''), `${def.id} set ${card?.set}`).toBe(true);
    }
  });
});
