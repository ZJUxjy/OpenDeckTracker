import { describe, expect, it } from 'vitest';
import enUS from '../../../../../resources/locales/en-US.json';
import zhCN from '../../../../../resources/locales/zh-CN.json';

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return prefix === '' ? [] : [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

describe('locale messages', () => {
  it('keeps en-US and zh-CN dictionary keys in sync', () => {
    const enKeys = flattenKeys(enUS).sort();
    const zhKeys = flattenKeys(zhCN).sort();

    expect(zhKeys).toEqual(enKeys);
  });
});
