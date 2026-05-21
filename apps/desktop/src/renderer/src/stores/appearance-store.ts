import { create } from 'zustand';

export const APPEARANCE_STORAGE_KEY = 'hdt.appearance';

// One-shot v1 migration: testers who ran any pre-`b47024c` build had
// `uiStyle: 'fallout76'` written into their localStorage on first launch
// (the previous default). When the v1 default flipped to `macos`, those
// existing testers kept seeing Fallout because localStorage outranks
// DEFAULTS. This sentinel records that the v1 reset has been applied
// to this profile; on first read after upgrade, if no sentinel is set
// AND the stored `uiStyle` is `fallout76`, flip it to `macos` once.
// Subsequent reads see the sentinel and leave the value alone — so a
// user who deliberately re-picks Fallout from Settings after the
// migration keeps Fallout.
export const APPEARANCE_V1_MACOS_RESET_KEY = 'hdt.appearance.v1MacosReset';

export type Density = 'comfortable' | 'compact';

/** Visual skin only; layout stays the current top-navigation structure. */
export type UiStyle = 'tavern' | 'macos' | 'wechat' | 'fallout76';

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
const DEFAULT_UI_STYLE: UiStyle = 'macos';
const DEFAULT_ACCENT: Accent = 'blue';
const DEFAULT_THEME: Theme = 'system';
const DEFAULT_GAME_OVERLAY = false;
const DEFAULT_GAME_OVERLAY_OPPONENT = false;

const VALID_DENSITIES = new Set<string>(['comfortable', 'compact']);
const VALID_UI_STYLES = new Set<string>(['tavern', 'macos', 'wechat', 'fallout76']);
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

export type AppearanceSyncPayload = Partial<StoredShape>;

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
  syncFromExternal: (next: unknown) => void;
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

  let coerced: StoredShape;
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) {
      // No prior settings — mark the v1 reset as already-applied so
      // future loads don't second-guess a brand-new install where
      // `fallout76` would only ever be a deliberate user choice.
      try { localStorage.setItem(APPEARANCE_V1_MACOS_RESET_KEY, '1'); } catch { /* ignore */ }
      return { ...DEFAULTS };
    }
    coerced = coerceStoredShape(JSON.parse(raw));
  } catch {
    return { ...DEFAULTS };
  }

  // Apply the one-shot v1 reset if a pre-flip tester still has `fallout76`.
  try {
    if (localStorage.getItem(APPEARANCE_V1_MACOS_RESET_KEY) !== '1') {
      if (coerced.uiStyle === 'fallout76') {
        coerced = { ...coerced, uiStyle: 'macos' };
        writeStored(coerced);
      }
      localStorage.setItem(APPEARANCE_V1_MACOS_RESET_KEY, '1');
    }
  } catch {
    // Storage write failures don't block the in-memory value; next launch will try again.
  }
  return coerced;
}

function coerceStoredShape(raw: unknown): StoredShape {
  const parsed = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    density: VALID_DENSITIES.has(parsed['density'] as string) ? parsed['density'] as Density : DEFAULT_DENSITY,
    uiStyle: VALID_UI_STYLES.has(parsed['uiStyle'] as string) ? parsed['uiStyle'] as UiStyle : DEFAULT_UI_STYLE,
    accent: coerceAccent(parsed['accent']),
    theme: VALID_THEMES.has(parsed['theme'] as string) ? parsed['theme'] as Theme : DEFAULT_THEME,
    gameOverlay: typeof parsed['gameOverlay'] === 'boolean' ? parsed['gameOverlay'] : DEFAULT_GAME_OVERLAY,
    gameOverlayOpponent: typeof parsed['gameOverlayOpponent'] === 'boolean' ? parsed['gameOverlayOpponent'] : DEFAULT_GAME_OVERLAY_OPPONENT,
  };
}

function writeStored(s: StoredShape): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(s));
    // Stamp the v1-reset sentinel on every deliberate save. Any value
    // written by `writeStored` is by definition a deliberate user
    // choice (or a value coming back from another renderer window's
    // explicit save), so the v1 one-shot migration MUST NOT undo it
    // on the next read. Without this, a user who re-picks `fallout76`
    // via Settings after the migration ran in one session would see
    // it flipped back to `macos` the next time the module is re-read
    // in a context where the sentinel hasn't been propagated yet.
    localStorage.setItem(APPEARANCE_V1_MACOS_RESET_KEY, '1');
  } catch {
    // Ignore storage errors; the in-memory setting still updates for this session.
  }
}

function broadcastStored(s: StoredShape): void {
  if (typeof window === 'undefined') return;
  const result = window.hdt?.appearance?.broadcast?.(s);
  if (result && typeof result.catch === 'function') {
    void result.catch(() => undefined);
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
    const stored = { density: next, uiStyle: s.uiStyle, accent: s.accent, theme: s.theme, gameOverlay: s.gameOverlay, gameOverlayOpponent: s.gameOverlayOpponent };
    writeStored(stored);
    broadcastStored(stored);
    set({ density: next });
  },
  setUiStyle: (next) => {
    const s = useAppearanceStore.getState();
    const stored = { density: s.density, uiStyle: next, accent: s.accent, theme: s.theme, gameOverlay: s.gameOverlay, gameOverlayOpponent: s.gameOverlayOpponent };
    writeStored(stored);
    broadcastStored(stored);
    set({ uiStyle: next });
  },
  setAccent: (next) => {
    const s = useAppearanceStore.getState();
    const stored = { density: s.density, uiStyle: s.uiStyle, accent: next, theme: s.theme, gameOverlay: s.gameOverlay, gameOverlayOpponent: s.gameOverlayOpponent };
    writeStored(stored);
    broadcastStored(stored);
    set({ accent: next });
  },
  setTheme: (next) => {
    const s = useAppearanceStore.getState();
    const stored = { density: s.density, uiStyle: s.uiStyle, accent: s.accent, theme: next, gameOverlay: s.gameOverlay, gameOverlayOpponent: s.gameOverlayOpponent };
    writeStored(stored);
    broadcastStored(stored);
    set({ theme: next });
  },
  setGameOverlay: (next) => {
    const s = useAppearanceStore.getState();
    const stored = { density: s.density, uiStyle: s.uiStyle, accent: s.accent, theme: s.theme, gameOverlay: next, gameOverlayOpponent: s.gameOverlayOpponent };
    writeStored(stored);
    broadcastStored(stored);
    set({ gameOverlay: next });
    window.hdt?.overlay?.setEnabled?.(next);
  },
  setGameOverlayOpponent: (next) => {
    const s = useAppearanceStore.getState();
    const stored = { density: s.density, uiStyle: s.uiStyle, accent: s.accent, theme: s.theme, gameOverlay: s.gameOverlay, gameOverlayOpponent: next };
    writeStored(stored);
    broadcastStored(stored);
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
  syncFromExternal: (raw) => {
    const next = coerceStoredShape(raw);
    writeStored(next);
    set(next);
  },
}));
