import { create } from 'zustand';

export const APPEARANCE_STORAGE_KEY = 'hdt.appearance';

export type Density = 'comfortable' | 'compact';

/** Visual skin only; layout stays the current top-navigation structure. */
export type UiStyle = 'tavern' | 'macos';

/** macOS Sequoia / iOS system accent colors. */
export type Accent =
  | 'blue'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'mint'
  | 'purple'
  | 'pink';

/** System / Light / Dark — `system` follows OS prefers-color-scheme. */
export type Theme = 'system' | 'light' | 'dark';

/** Each accent has Light + Dark variants; the dim variant is used
 *  for translucent backgrounds (selected rows, badges, etc.). */
interface AccentValues {
  /** Foreground accent — Light mode. */
  accentLight: string;
  /** Foreground accent — Dark mode. */
  accentDark: string;
  /** Translucent background — Light. */
  accentDimLight: string;
  /** Translucent background — Dark. */
  accentDimDark: string;
}

export const ACCENT_PALETTE: Record<Accent, AccentValues> = {
  blue:   { accentLight: '#007AFF', accentDark: '#0A84FF', accentDimLight: 'rgba(0,122,255,0.15)',  accentDimDark: 'rgba(10,132,255,0.22)' },
  red:    { accentLight: '#FF3B30', accentDark: '#FF453A', accentDimLight: 'rgba(255,59,48,0.15)',  accentDimDark: 'rgba(255,69,58,0.22)' },
  orange: { accentLight: '#FF9500', accentDark: '#FF9F0A', accentDimLight: 'rgba(255,149,0,0.15)',  accentDimDark: 'rgba(255,159,10,0.22)' },
  yellow: { accentLight: '#FFCC00', accentDark: '#FFD60A', accentDimLight: 'rgba(255,204,0,0.15)',  accentDimDark: 'rgba(255,214,10,0.22)' },
  green:  { accentLight: '#28A745', accentDark: '#30D158', accentDimLight: 'rgba(40,167,69,0.15)',  accentDimDark: 'rgba(48,209,88,0.22)' },
  mint:   { accentLight: '#00C7BE', accentDark: '#63E6E2', accentDimLight: 'rgba(0,199,190,0.15)',  accentDimDark: 'rgba(99,230,226,0.22)' },
  purple: { accentLight: '#AF52DE', accentDark: '#BF5AF2', accentDimLight: 'rgba(175,82,222,0.15)', accentDimDark: 'rgba(191,90,242,0.22)' },
  pink:   { accentLight: '#FF2D55', accentDark: '#FF375F', accentDimLight: 'rgba(255,45,85,0.15)',  accentDimDark: 'rgba(255,55,95,0.22)' },
};

const DEFAULT_DENSITY: Density = 'comfortable';
const DEFAULT_UI_STYLE: UiStyle = 'tavern';
const DEFAULT_ACCENT: Accent = 'blue';
const DEFAULT_THEME: Theme = 'system';
const DEFAULT_GAME_OVERLAY = false;
const DEFAULT_GAME_OVERLAY_OPPONENT = false;

const VALID_DENSITIES = new Set<string>(['comfortable', 'compact']);
const VALID_UI_STYLES = new Set<string>(['tavern', 'macos']);
const VALID_ACCENTS = new Set<string>(['blue','red','orange','yellow','green','mint','purple','pink']);
const VALID_THEMES = new Set<string>(['system', 'light', 'dark']);

/** Migration table for legacy accent values stored before the macOS
 *  redesign. Maps each old value to its closest System-color equivalent. */
const LEGACY_ACCENT_MIGRATION: Record<string, Accent> = {
  cyan: 'mint',
  teal: 'mint',
  violet: 'purple',
};

interface StoredShape {
  density: Density;
  uiStyle: UiStyle;
  accent: Accent;
  theme: Theme;
  gameOverlay: boolean;
  gameOverlayOpponent: boolean;
}

interface AppearanceState extends StoredShape {
  setDensity: (next: Density) => void;
  setUiStyle: (next: UiStyle) => void;
  setAccent: (next: Accent) => void;
  setTheme: (next: Theme) => void;
  setGameOverlay: (next: boolean) => void;
  setGameOverlayOpponent: (next: boolean) => void;
  /**
   * Silent setter — updates the in-memory store + localStorage
   * WITHOUT firing the `window.hdt.overlay.setEnabled*` IPC. Used by
   * the cross-window sync path (when the main process tells us another
   * window's close button disabled an overlay), so we don't echo the
   * disable back to main and create a feedback loop.
   */
  silentSetGameOverlay: (next: boolean) => void;
  silentSetGameOverlayOpponent: (next: boolean) => void;
}

const DEFAULTS: StoredShape = {
  density: DEFAULT_DENSITY,
  uiStyle: DEFAULT_UI_STYLE,
  accent: DEFAULT_ACCENT,
  theme: DEFAULT_THEME,
  gameOverlay: DEFAULT_GAME_OVERLAY,
  gameOverlayOpponent: DEFAULT_GAME_OVERLAY_OPPONENT,
};

function coerceAccent(raw: unknown): Accent {
  if (typeof raw !== 'string') return DEFAULT_ACCENT;
  if (VALID_ACCENTS.has(raw)) return raw as Accent;
  // migrate legacy values silently
  return LEGACY_ACCENT_MIGRATION[raw] ?? DEFAULT_ACCENT;
}

function readStored(): StoredShape {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS };

  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      density: VALID_DENSITIES.has(parsed?.density) ? parsed.density : DEFAULT_DENSITY,
      uiStyle: VALID_UI_STYLES.has(parsed?.uiStyle) ? parsed.uiStyle : DEFAULT_UI_STYLE,
      accent: coerceAccent(parsed?.accent),
      theme: VALID_THEMES.has(parsed?.theme) ? parsed.theme : DEFAULT_THEME,
      gameOverlay: typeof parsed?.gameOverlay === 'boolean' ? parsed.gameOverlay : DEFAULT_GAME_OVERLAY,
      gameOverlayOpponent: typeof parsed?.gameOverlayOpponent === 'boolean' ? parsed.gameOverlayOpponent : DEFAULT_GAME_OVERLAY_OPPONENT,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeStored(s: StoredShape): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Ignore storage errors; the in-memory setting still updates for this session.
  }
}

const initial = readStored();

export const useAppearanceStore = create<AppearanceState>((set) => ({
  density: initial.density,
  uiStyle: initial.uiStyle,
  accent: initial.accent,
  theme: initial.theme,
  gameOverlay: initial.gameOverlay,
  gameOverlayOpponent: initial.gameOverlayOpponent,
  setDensity: (next) => {
    const s = useAppearanceStore.getState();
    writeStored({ density: next, uiStyle: s.uiStyle, accent: s.accent, theme: s.theme, gameOverlay: s.gameOverlay, gameOverlayOpponent: s.gameOverlayOpponent });
    set({ density: next });
  },
  setUiStyle: (next) => {
    const s = useAppearanceStore.getState();
    writeStored({ density: s.density, uiStyle: next, accent: s.accent, theme: s.theme, gameOverlay: s.gameOverlay, gameOverlayOpponent: s.gameOverlayOpponent });
    set({ uiStyle: next });
  },
  setAccent: (next) => {
    const s = useAppearanceStore.getState();
    writeStored({ density: s.density, uiStyle: s.uiStyle, accent: next, theme: s.theme, gameOverlay: s.gameOverlay, gameOverlayOpponent: s.gameOverlayOpponent });
    set({ accent: next });
  },
  setTheme: (next) => {
    const s = useAppearanceStore.getState();
    writeStored({ density: s.density, uiStyle: s.uiStyle, accent: s.accent, theme: next, gameOverlay: s.gameOverlay, gameOverlayOpponent: s.gameOverlayOpponent });
    set({ theme: next });
  },
  setGameOverlay: (next) => {
    const s = useAppearanceStore.getState();
    writeStored({ density: s.density, uiStyle: s.uiStyle, accent: s.accent, theme: s.theme, gameOverlay: next, gameOverlayOpponent: s.gameOverlayOpponent });
    set({ gameOverlay: next });
    window.hdt?.overlay?.setEnabled?.(next);
  },
  setGameOverlayOpponent: (next) => {
    const s = useAppearanceStore.getState();
    writeStored({ density: s.density, uiStyle: s.uiStyle, accent: s.accent, theme: s.theme, gameOverlay: s.gameOverlay, gameOverlayOpponent: next });
    set({ gameOverlayOpponent: next });
    window.hdt?.overlay?.setEnabledOpponent?.(next);
  },
  silentSetGameOverlay: (next) => {
    const s = useAppearanceStore.getState();
    writeStored({ density: s.density, uiStyle: s.uiStyle, accent: s.accent, theme: s.theme, gameOverlay: next, gameOverlayOpponent: s.gameOverlayOpponent });
    set({ gameOverlay: next });
  },
  silentSetGameOverlayOpponent: (next) => {
    const s = useAppearanceStore.getState();
    writeStored({ density: s.density, uiStyle: s.uiStyle, accent: s.accent, theme: s.theme, gameOverlay: s.gameOverlay, gameOverlayOpponent: next });
    set({ gameOverlayOpponent: next });
  },
}));
