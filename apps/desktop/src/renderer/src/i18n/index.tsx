import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';
import {
  DEFAULT_LANGUAGE_PREFERENCE,
  getSystemLanguage,
  resolveAppLocale,
  type AppLocale,
  type LanguagePreference,
} from './locale';
import {
  translate,
  type InterpolationValues,
  type MessagesByLocale,
} from './messages';

export { translate };
export type { InterpolationValues, MessagesByLocale };
export type { AppLocale, LanguagePreference };
export { toHearthstoneLocale, resolveAppLocale } from './locale';

const EMPTY_MESSAGES: MessagesByLocale = {
  'en-US': {},
  'zh-CN': {},
};

interface I18nContextValue {
  locale: AppLocale;
  preference: LanguagePreference;
  t: (key: string, values?: InterpolationValues) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en-US',
  preference: DEFAULT_LANGUAGE_PREFERENCE,
  t: (key) => key,
});

interface I18nProviderProps extends PropsWithChildren {
  messages?: MessagesByLocale;
  preference?: LanguagePreference;
  systemLanguage?: string;
}

export function I18nProvider({
  children,
  messages = EMPTY_MESSAGES,
  preference = DEFAULT_LANGUAGE_PREFERENCE,
  systemLanguage = getSystemLanguage(),
}: I18nProviderProps) {
  const locale = resolveAppLocale(preference, systemLanguage);
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      preference,
      t: (key, values) => translate(messages, locale, key, values),
    }),
    [locale, messages, preference],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
  return useContext(I18nContext);
}

export function useLocale(): AppLocale {
  return useContext(I18nContext).locale;
}
