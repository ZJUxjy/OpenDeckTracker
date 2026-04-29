import { create } from 'zustand';

export const APPEARANCE_STORAGE_KEY = 'hdt.appearance';

export type Density = 'comfortable' | 'compact';
export type Accent = 'cyan' | 'teal' | 'violet';

export const ACCENT_PALETTE: Record<Accent, { accent: string; accentDim: string }> = {
  cyan:   { accent: '#22d3ee', accentDim: 'rgba(34,211,238,0.15)' },
  teal:   { accent: '#2dd4bf', accentDim: 'rgba(45,212,191,0.15)' },
  violet: { accent: '#a78bfa', accentDim: 'rgba(167,139,250,0.15)' },
};

const DEFAULT_DENSITY: Density = 'comfortable';
const DEFAULT_ACCENT: Accent = 'cyan';
const DEFAULT_GAME_OVERLAY = false;
const DEFAULT_GAME_OVERLAY_OPPONENT = false;

const VALID_DENSITIES = new Set<string>(['comfortable', 'compact']);
const VALID_ACCENTS = new Set<string>(['cyan', 'teal', 'violet']);

interface StoredShape {
  density: Density;
  accent: Accent;
  gameOverlay: boolean;
  gameOverlayOpponent: boolean;
}

interface AppearanceState extends StoredShape {
  setDensity: (next: Density) => void;
  setAccent: (next: Accent) => void;
  setGameOverlay: (next: boolean) => void;
  setGameOverlayOpponent: (next: boolean) => void;
}

const DEFAULTS: StoredShape = {
  density: DEFAULT_DENSITY,
  accent: DEFAULT_ACCENT,
  gameOverlay: DEFAULT_GAME_OVERLAY,
  gameOverlayOpponent: DEFAULT_GAME_OVERLAY_OPPONENT,
};

function readStored(): StoredShape {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS };

  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      density: VALID_DENSITIES.has(parsed?.density) ? parsed.density : DEFAULT_DENSITY,
      accent: VALID_ACCENTS.has(parsed?.accent) ? parsed.accent : DEFAULT_ACCENT,
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
  accent: initial.accent,
  gameOverlay: initial.gameOverlay,
  gameOverlayOpponent: initial.gameOverlayOpponent,
  setDensity: (next) => {
    const s = useAppearanceStore.getState();
    writeStored({ density: next, accent: s.accent, gameOverlay: s.gameOverlay, gameOverlayOpponent: s.gameOverlayOpponent });
    set({ density: next });
  },
  setAccent: (next) => {
    const s = useAppearanceStore.getState();
    writeStored({ density: s.density, accent: next, gameOverlay: s.gameOverlay, gameOverlayOpponent: s.gameOverlayOpponent });
    set({ accent: next });
  },
  setGameOverlay: (next) => {
    const s = useAppearanceStore.getState();
    writeStored({ density: s.density, accent: s.accent, gameOverlay: next, gameOverlayOpponent: s.gameOverlayOpponent });
    set({ gameOverlay: next });
    window.hdt?.overlay?.setEnabled?.(next);
  },
  setGameOverlayOpponent: (next) => {
    const s = useAppearanceStore.getState();
    writeStored({ density: s.density, accent: s.accent, gameOverlay: s.gameOverlay, gameOverlayOpponent: next });
    set({ gameOverlayOpponent: next });
    window.hdt?.overlay?.setEnabledOpponent?.(next);
  },
}));
