import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { convertHsdataCardsForTest } from '../../../scripts/convert-hsdata-cards';
import { loadCards } from './card-loader';

const fixturePath = fileURLToPath(new URL('./tests/fixtures/hsdata-mini.xml', import.meta.url));

const tempDirs: string[] = [];

async function generateFixture(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'hdt-hearthdb-loader-'));
  tempDirs.push(dir);
  await convertHsdataCardsForTest(fixturePath, dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('loadCards with hsdata generated JSON', () => {
  it('loads full and collectible generated datasets', async () => {
    const dir = await generateFixture();
    const full = await loadCards(path.join(dir, 'cards.all.enUS.json'));
    const collectible = await loadCards(path.join(dir, 'cards.collectible.enUS.json'));

    expect(full.size).toBeGreaterThanOrEqual(collectible.size);
    expect(full.findById('HERO_08bp')?.collectible).toBe(false);
    expect(collectible.search({ limit: 100 }).every((card) => card.collectible)).toBe(true);
  });
});
