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
  /**
   * Apply an external preference change (came in over the appearance
   * broadcast from another BrowserWindow) without re-broadcasting.
   * Writes through to localStorage so a refresh of this window
   * persists the new value.
   */
  syncFromExternal: (preference: LanguagePreference) => void;
  getActiveLocale: (systemLanguage?: string) => AppLocale;
}

export const useI18nStore = create<I18nStoreState>((set, get) => ({
  languagePreference: readStoredPreference(),
  setLanguagePreference: (preference) => {
    writeStoredPreference(preference);
    set({ languagePreference: preference });
    // Push the change to the other BrowserWindows (overlays + card
    // preview) so their in-memory I18n store updates in lockstep.
    // Each renderer process has its own JS heap; localStorage is
    // shared but only on next bootstrap unless we explicitly notify.
    broadcastLanguagePreference(preference);
  },
  syncFromExternal: (preference) => {
    if (get().languagePreference === preference) return;
    writeStoredPreference(preference);
    set({ languagePreference: preference });
  },
  getActiveLocale: (systemLanguage = getSystemLanguage()) =>
    resolveAppLocale(get().languagePreference, systemLanguage),
}));

function broadcastLanguagePreference(preference: LanguagePreference): void {
  if (typeof window === 'undefined') return;
  const result = window.hdt?.appearance?.broadcast?.({ languagePreference: preference });
  if (result && typeof result.catch === 'function') {
    void result.catch(() => undefined);
  }
}

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
