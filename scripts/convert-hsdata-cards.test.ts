import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { convertHsdataCardsForTest } from './convert-hsdata-cards';

const root = process.cwd();
const miniXml = path.join(root, 'packages/hearthdb/src/tests/fixtures/hsdata-mini.xml');
const duplicateXml = path.join(root, 'scripts/fixtures/hsdata-duplicates.xml');
const unknownEnumXml = path.join(root, 'scripts/fixtures/hsdata-unknown-enum.xml');

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'hdt-hsdata-'));
  tempDirs.push(dir);
  return dir;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('convertHsdataCardsForTest', () => {
  it('maps representative hsdata tags to CardDef fields', async () => {
    const outDir = await makeTempDir();
    await convertHsdataCardsForTest(miniXml, outDir);

    const cards = await readJson<Array<Record<string, unknown>>>(
      path.join(outDir, 'cards.all.enUS.json'),
    );
    const fireball = cards.find((card) => card.id === 'CS2_029');

    expect(fireball).toMatchObject({
      id: 'CS2_029',
      dbfId: 315,
      name: 'Fireball',
      cost: 4,
      cardClass: 'MAGE',
      type: 'SPELL',
      collectible: true,
    });
    expect(fireball?.mechanics).toEqual(['FREEZE']);
  });

  it('falls zhCN names back to enUS when zhCN is missing', async () => {
    const outDir = await makeTempDir();
    await convertHsdataCardsForTest(miniXml, outDir);

    const cards = await readJson<Array<Record<string, unknown>>>(
      path.join(outDir, 'cards.all.zhCN.json'),
    );
    const fallback = cards.find((card) => card.id === 'TEST_NO_ZHCN');

    expect(fallback?.name).toBe('Fallback Name');
  });

  it('writes full and collectible-only outputs', async () => {
    const outDir = await makeTempDir();
    await convertHsdataCardsForTest(miniXml, outDir);

    const allCards = await readJson<Array<Record<string, unknown>>>(
      path.join(outDir, 'cards.all.enUS.json'),
    );
    const collectibleCards = await readJson<Array<Record<string, unknown>>>(
      path.join(outDir, 'cards.collectible.enUS.json'),
    );

    expect(allCards.some((card) => card.collectible === false)).toBe(true);
    expect(collectibleCards.length).toBeLessThan(allCards.length);
    expect(collectibleCards.every((card) => card.collectible === true)).toBe(true);
  });

  it('produces byte-stable card JSON for repeated conversions', async () => {
    const outA = await makeTempDir();
    const outB = await makeTempDir();

    await convertHsdataCardsForTest(miniXml, outA);
    await convertHsdataCardsForTest(miniXml, outB);

    const a = await readFile(path.join(outA, 'cards.all.enUS.json'), 'utf8');
    const b = await readFile(path.join(outB, 'cards.all.enUS.json'), 'utf8');
    expect(a).toBe(b);
  });

  it('rejects duplicate CardID values', async () => {
    const outDir = await makeTempDir();

    await expect(convertHsdataCardsForTest(duplicateXml, outDir)).rejects.toThrow(
      /DUP_CARD/,
    );
  });

  it('rejects unsupported enum values with card context', async () => {
    const outDir = await makeTempDir();

    await expect(convertHsdataCardsForTest(unknownEnumXml, outDir)).rejects.toThrow(
      /CARDTYPE.*9999.*BAD_CARDTYPE|BAD_CARDTYPE.*CARDTYPE.*9999/,
    );
  });

  it('writes build metadata', async () => {
    const outDir = await makeTempDir();
    await convertHsdataCardsForTest(miniXml, outDir);

    const metadata = await readJson<Record<string, unknown>>(
      path.join(outDir, 'card-build.json'),
    );

    expect(metadata).toMatchObject({
      build: '240818',
      totalCards: 3,
      collectibleCards: 2,
      locales: ['enUS', 'zhCN'],
    });
    expect(metadata.source).toContain('hsdata-mini.xml');
    expect(metadata.generatedAt).toEqual(expect.any(String));
  });
});
