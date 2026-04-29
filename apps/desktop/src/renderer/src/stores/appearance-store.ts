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

const VALID_DENSITIES = new Set<string>(['comfortable', 'compact']);
const VALID_ACCENTS = new Set<string>(['cyan', 'teal', 'violet']);

interface AppearanceState {
  density: Density;
  accent: Accent;
  setDensity: (next: Density) => void;
  setAccent: (next: Accent) => void;
}

function readStored(): { density: Density; accent: Accent } {
  if (typeof localStorage === 'undefined') return { density: DEFAULT_DENSITY, accent: DEFAULT_ACCENT };

  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return { density: DEFAULT_DENSITY, accent: DEFAULT_ACCENT };
    const parsed = JSON.parse(raw);
    const density = VALID_DENSITIES.has(parsed?.density) ? parsed.density : DEFAULT_DENSITY;
    const accent = VALID_ACCENTS.has(parsed?.accent) ? parsed.accent : DEFAULT_ACCENT;
    return { density, accent };
  } catch {
    return { density: DEFAULT_DENSITY, accent: DEFAULT_ACCENT };
  }
}

function writeStored(density: Density, accent: Accent): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ density, accent }));
  } catch {
    // Ignore storage errors; the in-memory setting still updates for this session.
  }
}

const initial = readStored();

export const useAppearanceStore = create<AppearanceState>((set) => ({
  density: initial.density,
  accent: initial.accent,
  setDensity: (next) => {
    writeStored(next, useAppearanceStore.getState().accent);
    set({ density: next });
  },
  setAccent: (next) => {
    writeStored(useAppearanceStore.getState().density, next);
    set({ accent: next });
  },
}));
