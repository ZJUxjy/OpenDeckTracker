import { describe, expect, it } from 'vitest';
import { resolveAppLocale, toHearthstoneLocale } from '../src/i18n/locale';

describe('i18n locale resolution', () => {
  it('resolves Chinese system locales to zh-CN', () => {
    expect(resolveAppLocale('system', 'zh-Hans-CN')).toBe('zh-CN');
    expect(resolveAppLocale('system', 'zh')).toBe('zh-CN');
  });

  it('falls unsupported system locales back to en-US', () => {
    expect(resolveAppLocale('system', 'fr-FR')).toBe('en-US');
  });

  it('lets explicit preference override system locale', () => {
    expect(resolveAppLocale('en-US', 'zh-CN')).toBe('en-US');
  });

  it('maps app locale to Hearthstone locale', () => {
    expect(toHearthstoneLocale('en-US')).toBe('enUS');
    expect(toHearthstoneLocale('zh-CN')).toBe('zhCN');
  });
});
