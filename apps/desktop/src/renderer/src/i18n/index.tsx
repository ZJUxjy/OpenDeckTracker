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
import { useI18nStore } from './i18n-store';
import enUS from '../../../../../../resources/locales/en-US.json';
import zhCN from '../../../../../../resources/locales/zh-CN.json';

export { translate };
export type { InterpolationValues, MessagesByLocale };
export type { AppLocale, LanguagePreference };
export { toHearthstoneLocale, resolveAppLocale } from './locale';

export const defaultMessages: MessagesByLocale = {
  'en-US': enUS,
  'zh-CN': zhCN,
};

interface I18nContextValue {
  locale: AppLocale;
  preference: LanguagePreference;
  t: (key: string, values?: InterpolationValues) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en-US',
  preference: DEFAULT_LANGUAGE_PREFERENCE,
  t: (key, values) => translate(defaultMessages, 'en-US', key, values),
});

interface I18nProviderProps extends PropsWithChildren {
  messages?: MessagesByLocale;
  preference?: LanguagePreference;
  systemLanguage?: string;
}

export function I18nProvider({
  children,
  messages = defaultMessages,
  preference,
  systemLanguage = getSystemLanguage(),
}: I18nProviderProps) {
  const storePreference = useI18nStore((state) => state.languagePreference);
  const resolvedPreference = preference ?? storePreference ?? DEFAULT_LANGUAGE_PREFERENCE;
  const locale = resolveAppLocale(resolvedPreference, systemLanguage);
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      preference: resolvedPreference,
      t: (key, values) => translate(messages, locale, key, values),
    }),
    [locale, messages, resolvedPreference],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
  return useContext(I18nContext);
}

export function useLocale(): AppLocale {
  return useContext(I18nContext).locale;
}
