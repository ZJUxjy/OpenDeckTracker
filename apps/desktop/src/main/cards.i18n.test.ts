import { beforeEach, describe, expect, it } from 'vitest';
import { clearCardDbCacheForTests, ensureCardDb } from './cards';

describe('localized card database loading', () => {
  beforeEach(() => {
    clearCardDbCacheForTests();
  });

  it('loads generated zhCN card data by requested locale', async () => {
    const db = await ensureCardDb('zhCN');

    expect(db.findById('EX1_277')?.name).toBe('奥术飞弹');
  });

  it('falls back to enUS when requested locale data is missing', async () => {
    const db = await ensureCardDb('missing');

    expect(db.findById('EX1_277')?.name).toBe('Arcane Missiles');
  });
});
