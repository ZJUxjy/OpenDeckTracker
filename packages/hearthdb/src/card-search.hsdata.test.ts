import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { convertHsdataCardsForTest } from '../../../scripts/convert-hsdata-cards';
import { loadCards } from './card-loader';

const fixturePath = fileURLToPath(new URL('./tests/fixtures/hsdata-mini.xml', import.meta.url));

const tempDirs: string[] = [];

async function makeGeneratedDb() {
  const dir = await mkdtemp(path.join(tmpdir(), 'hdt-hearthdb-hsdata-'));
  tempDirs.push(dir);
  await convertHsdataCardsForTest(fixturePath, dir);
  return loadCards(path.join(dir, 'cards.all.enUS.json'));
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('CardDb.search with hsdata generated cards', () => {
  it('filters collectible cards', async () => {
    const db = await makeGeneratedDb();
    const cards = db.search({ collectible: true, limit: 100 });

    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((card) => card.collectible)).toBe(true);
  });

  it('filters non-collectible cards', async () => {
    const db = await makeGeneratedDb();
    const cards = db.search({ collectible: false, limit: 100 });

    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((card) => !card.collectible)).toBe(true);
  });

  it('AND-combines collectible with class, cost, and type', async () => {
    const db = await makeGeneratedDb();
    const cards = db.search({
      cardClass: 'MAGE',
      cost: 4,
      type: 'SPELL',
      collectible: true,
      limit: 100,
    });

    expect(cards.map((card) => card.id)).toContain('CS2_029');
    expect(
      cards.every(
        (card) =>
          card.cardClass === 'MAGE' &&
          card.cost === 4 &&
          card.type === 'SPELL' &&
          card.collectible,
      ),
    ).toBe(true);
  });
});
