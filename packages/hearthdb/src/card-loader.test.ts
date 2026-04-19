import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadCards } from './card-loader';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tinyPath = resolve(__dirname, 'tests/fixtures/tiny-cards.json');
const brokenPath = resolve(__dirname, 'tests/fixtures/broken.json');

describe('loadCards', () => {
  it('builds dbfId and id indices', async () => {
    const db = await loadCards(tinyPath);
    expect(db.size).toBe(10);
    const card = db.findByDbfId(1);
    expect(card?.name).toBe('Argent Squire');
  });

  it('shares card references between indices', async () => {
    const db = await loadCards(tinyPath);
    const a = db.findByDbfId(2);
    expect(a).toBeDefined();
    const b = db.findById(a!.id);
    expect(b).toBe(a);
  });

  it('returns undefined for unknown dbfId', async () => {
    const db = await loadCards(tinyPath);
    expect(db.findByDbfId(99999999)).toBeUndefined();
  });

  it('returns undefined for unknown id', async () => {
    const db = await loadCards(tinyPath);
    expect(db.findById('NONEXISTENT_ID')).toBeUndefined();
  });

  it('throws on missing file', async () => {
    await expect(loadCards(resolve(__dirname, 'tests/fixtures/no-such-file.json'))).rejects.toThrow(
      /ENOENT|no such file/i,
    );
  });

  it('throws on broken JSON', async () => {
    await expect(loadCards(brokenPath)).rejects.toThrow(/JSON|parse/i);
  });
});
