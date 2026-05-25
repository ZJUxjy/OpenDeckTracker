/**
 * Cross-checks `STANDARD_SET_CODES` and `SET_LABELS` against the real
 * generated card database under `data/cards/generated/`. Catches the
 * silent failure where a set code drifts out of the production data
 * and tiles disappear / fall to the unknown-set placeholder.
 *
 * Skips automatically when the generated JSON is not present (CI
 * builds that don't ship Cards data).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { STANDARD_SET_CODES, SET_LABELS } from './set-meta';
import type { CardDef } from './card-defs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const cardsJsonPath = resolve(repoRoot, 'data/cards/generated/cards.collectible.enUS.json');

const skip = !existsSync(cardsJsonPath);
const describeIfData = skip ? describe.skip : describe;

describeIfData('set-meta vs real card database', () => {
  const allCollectible = JSON.parse(readFileSync(cardsJsonPath, 'utf-8')) as CardDef[];
  const setsInData = new Map<string, number>();
  for (const card of allCollectible) {
    setsInData.set(card.set, (setsInData.get(card.set) ?? 0) + 1);
  }

  it('every STANDARD_SET_CODES entry returns >=1 collectible card', () => {
    const empty = STANDARD_SET_CODES.filter((code) => !setsInData.has(code));
    expect(
      empty,
      `Standard set codes with zero cards in the production data: ${empty.join(', ')}. ` +
        `These rotated out, were renumbered, or are typos. Update set-meta.ts.`,
    ).toEqual([]);
  });

  it('every SET_LABELS entry that is supposed to be Standard appears in the data', () => {
    // Only enforce labels for Standard codes — historical Wild labels
    // are allowed to outlive their data presence.
    for (const code of STANDARD_SET_CODES) {
      expect(SET_LABELS[code], `missing label for Standard code ${code}`).toBeDefined();
      expect(setsInData.get(code) ?? 0).toBeGreaterThan(0);
    }
  });

  it('reports any set codes in production data that are missing from SET_LABELS', () => {
    // Soft check: records the gap as an output but does not fail. Helps
    // future maintainers spot drift; does not block CI.
    const missing = [...setsInData.keys()].filter((code) => !SET_LABELS[code]);
    if (missing.length > 0) {
       
      console.warn(
        `[set-meta] ${missing.length} set codes in production data have no SET_LABELS entry: ${missing.join(', ')}`,
      );
    }
    expect(true).toBe(true);
  });
});
