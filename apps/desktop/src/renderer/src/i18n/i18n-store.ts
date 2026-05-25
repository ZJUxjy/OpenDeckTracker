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
export const LANGUAGE_PREFERENCE_CHANGED_EVENT = 'hdt:language-preference-changed';

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
    notifyLanguagePreferenceChanged(preference);
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
    notifyLanguagePreferenceChanged(preference);
  },
  getActiveLocale: (systemLanguage = getSystemLanguage()) =>
    resolveAppLocale(get().languagePreference, systemLanguage),
}));

function broadcastLanguagePreference(preference: LanguagePreference): void {
  if (typeof window === 'undefined') return;
  // Dedicated `i18n` IPC channel — DO NOT route through `appearance`
  // here. The appearance broadcast is consumed by AppearanceApplyEffect
  // which treats every payload as the full appearance state and resets
  // unmentioned keys (uiStyle / accent / theme / ...) to defaults.
  // Riding language on that channel was wiping every other window's
  // visual appearance whenever the user toggled language.
  const result = window.hdt?.i18n?.broadcast?.({ languagePreference: preference });
  if (result && typeof result.catch === 'function') {
    void result.catch(() => undefined);
  }
}

function notifyLanguagePreferenceChanged(preference: LanguagePreference): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(LANGUAGE_PREFERENCE_CHANGED_EVENT, {
      detail: { languagePreference: preference },
    }),
  );
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
