import { useEffect, useRef } from 'react';
import {
  APPEARANCE_STORAGE_KEY,
  useAppearanceStore,
  ACCENT_PALETTE,
  type Theme,
  type UiStyle,
} from '../stores/appearance-store';

/** Resolves the effective dark-mode boolean for a given theme preference. */
function resolveIsDark(theme: Theme): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  // 'system' — follow OS preference
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(isDark: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', isDark);
  // color-scheme tells the engine which form-control / scrollbar variant to render
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
}

function applyAccent(accent: import('../stores/appearance-store').Accent, isDark: boolean) {
  if (typeof document === 'undefined') return;
  const palette = ACCENT_PALETTE[accent];
  const root = document.documentElement;
  // Override the --accent and --accent-dim CSS variables for the active mode.
  // The .dark class still drives all OTHER token swaps; this just routes
  // user-picked accent into the existing variable.
  root.style.setProperty('--accent', isDark ? palette.accentDark : palette.accentLight);
  root.style.setProperty(
    '--accent-dim',
    isDark ? palette.accentDimDark : palette.accentDimLight,
  );
  // Keep the translucent/hover/pressed variants coherent — derive simple
  // adjustments instead of demanding a full per-accent palette.
  root.style.setProperty(
    '--accent-translucent',
    isDark ? palette.accentDimDark : palette.accentDimLight,
  );
}

function applyFalloutAccent() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--accent', '#6DFF55');
  root.style.setProperty('--accent-dim', 'rgba(109, 255, 85, 0.18)');
  root.style.setProperty('--accent-translucent', 'rgba(109, 255, 85, 0.16)');
}

function applyDensity(density: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-density', density);
}

function applyUiStyle(uiStyle: UiStyle) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-ui-style', uiStyle);
}

/**
 * Bridges the appearance store to the DOM. Handles:
 *   • theme (light / dark / system) — toggles `.dark` class + listens
 *     for OS prefers-color-scheme changes when in 'system' mode
 *   • accent — writes --accent / --accent-dim to <html> in the
 *     mode-correct variant
 *   • UI style — writes data-ui-style="tavern|macos|wechat|fallout76"
 *   • density — writes data-density="..."
 *   • initial overlay enable — re-fires the IPC once on app boot if
 *     the user had overlays enabled previously
 */
export function AppearanceApplyEffect() {
  const density = useAppearanceStore((s) => s.density);
  const uiStyle = useAppearanceStore((s) => s.uiStyle);
  const accent = useAppearanceStore((s) => s.accent);
  const theme = useAppearanceStore((s) => s.theme);
  const bootOverlayFired = useRef(false);

  useEffect(() => {
    const sync = (next: unknown) => {
      useAppearanceStore.getState().syncFromExternal(next);
    };
    const offAppearance = window.hdt?.appearance?.onChanged?.(sync);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== APPEARANCE_STORAGE_KEY || !event.newValue) return;
      try {
        sync(JSON.parse(event.newValue));
      } catch {
        // Ignore malformed external writes; local store validation handles
        // normal legacy payloads.
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      offAppearance?.();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Density — independent of theme
  useEffect(() => {
    applyDensity(density);
  }, [density]);

  useEffect(() => {
    applyUiStyle(uiStyle);
  }, [uiStyle]);

  // Theme + accent — accent depends on the resolved dark state, so
  // they're in the same effect. The WeChat and Fallout 76 skins are
  // intentionally dark.
  useEffect(() => {
    const isFixedDarkSkin = uiStyle === 'wechat' || uiStyle === 'fallout76';
    const isDark = isFixedDarkSkin ? true : resolveIsDark(theme);
    applyTheme(isDark);
    if (uiStyle === 'fallout76') applyFalloutAccent();
    else applyAccent(accent, isDark);

    if (isFixedDarkSkin) return;

    // System mode: listen for OS preference flips
    if (theme !== 'system') return;
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      applyTheme(e.matches);
      applyAccent(accent, e.matches);
    };
    // addEventListener is the modern API — older Safari needs addListener.
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener?.(handler);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener?.(handler);
    };
  }, [theme, accent, uiStyle]);

  // Boot-time overlay re-enable
  useEffect(() => {
    if (bootOverlayFired.current) return;
    bootOverlayFired.current = true;
    const { gameOverlay, gameOverlayOpponent } = useAppearanceStore.getState();
    if (gameOverlay) {
      window.hdt?.overlay?.setEnabled?.(true);
    }
    if (gameOverlayOpponent) {
      window.hdt?.overlay?.setEnabledOpponent?.(true);
    }
  }, []);

  return null;
}
