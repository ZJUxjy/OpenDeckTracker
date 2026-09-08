import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as hearthdb from '@hdt/hearthdb';
import { clearCardDbCacheForTests, ensureCardDb } from './cards';

describe('localized card database loading', () => {
  it('does not retain a rejected database initialization promise', async () => {
    const load = vi.spyOn(hearthdb, 'loadCards').mockRejectedValueOnce(new Error('temporary read failure'));
    try {
      await expect(ensureCardDb('enUS')).rejects.toThrow('temporary read failure');
      expect((await ensureCardDb('enUS')).findById('EX1_277')?.name).toBe('Arcane Missiles');
      expect(load).toHaveBeenCalledTimes(2);
    } finally { load.mockRestore(); }
  });
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
