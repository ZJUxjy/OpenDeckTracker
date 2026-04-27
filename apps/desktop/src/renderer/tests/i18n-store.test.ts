import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LANGUAGE_PREFERENCE_STORAGE_KEY } from '../src/i18n/i18n-store';

describe('i18n store persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('persists selected language preference to localStorage', async () => {
    const { useI18nStore } = await import('../src/i18n/i18n-store');

    useI18nStore.getState().setLanguagePreference('zh-CN');

    expect(localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBe('zh-CN');
    expect(useI18nStore.getState().getActiveLocale('en-US')).toBe('zh-CN');
  });

  it('hydrates preference from localStorage on fresh import', async () => {
    localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, 'zh-CN');

    const { useI18nStore } = await import('../src/i18n/i18n-store');

    expect(useI18nStore.getState().languagePreference).toBe('zh-CN');
    expect(useI18nStore.getState().getActiveLocale('en-US')).toBe('zh-CN');
  });

  it('falls invalid stored preferences back to system', async () => {
    localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, 'de-DE');

    const { useI18nStore } = await import('../src/i18n/i18n-store');

    expect(useI18nStore.getState().languagePreference).toBe('system');
    expect(useI18nStore.getState().getActiveLocale('fr-FR')).toBe('en-US');
  });
});
