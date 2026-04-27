import { create } from 'zustand';
import {
  DEFAULT_LANGUAGE_PREFERENCE,
  getSystemLanguage,
  isLanguagePreference,
  resolveAppLocale,
  type AppLocale,
  type LanguagePreference,
} from './locale';

export const LANGUAGE_PREFERENCE_STORAGE_KEY = 'hdt.languagePreference';

interface I18nStoreState {
  languagePreference: LanguagePreference;
  setLanguagePreference: (preference: LanguagePreference) => void;
  getActiveLocale: (systemLanguage?: string) => AppLocale;
}

export const useI18nStore = create<I18nStoreState>((set, get) => ({
  languagePreference: readStoredPreference(),
  setLanguagePreference: (preference) => {
    writeStoredPreference(preference);
    set({ languagePreference: preference });
  },
  getActiveLocale: (systemLanguage = getSystemLanguage()) =>
    resolveAppLocale(get().languagePreference, systemLanguage),
}));

export function readStoredPreference(): LanguagePreference {
  if (typeof localStorage === 'undefined') return DEFAULT_LANGUAGE_PREFERENCE;

  try {
    const value = localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY);
    return isLanguagePreference(value) ? value : DEFAULT_LANGUAGE_PREFERENCE;
  } catch {
    return DEFAULT_LANGUAGE_PREFERENCE;
  }
}

function writeStoredPreference(preference: LanguagePreference): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, preference);
  } catch {
    // Ignore storage errors; the in-memory setting still updates for this session.
  }
}
