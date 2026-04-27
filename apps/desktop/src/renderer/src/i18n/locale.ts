export type LanguagePreference = 'system' | 'en-US' | 'zh-CN';
export type AppLocale = 'en-US' | 'zh-CN';
export type HearthstoneLocale = 'enUS' | 'zhCN';

export const DEFAULT_APP_LOCALE: AppLocale = 'en-US';
export const DEFAULT_LANGUAGE_PREFERENCE: LanguagePreference = 'system';

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'system' || value === 'en-US' || value === 'zh-CN';
}

export function resolveAppLocale(
  preference: LanguagePreference,
  systemLanguage = getSystemLanguage(),
): AppLocale {
  if (preference !== 'system') return preference;

  const normalized = systemLanguage.toLowerCase();
  if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-CN';
  return DEFAULT_APP_LOCALE;
}

export function toHearthstoneLocale(locale: AppLocale): HearthstoneLocale {
  return locale === 'zh-CN' ? 'zhCN' : 'enUS';
}

export function getSystemLanguage(): string {
  if (typeof navigator === 'undefined') return DEFAULT_APP_LOCALE;
  return navigator.language || DEFAULT_APP_LOCALE;
}
