import { useEffect } from 'react';
import { useAppearanceStore, ACCENT_PALETTE } from '../stores/appearance-store';

function applyAppearance() {
  const { density, accent } = useAppearanceStore.getState();
  const root = document.documentElement;

  root.setAttribute('data-density', density);

  const palette = ACCENT_PALETTE[accent];
  root.style.setProperty('--accent', palette.accent);
  root.style.setProperty('--accent-dim', palette.accentDim);
}

export function AppearanceApplyEffect() {
  const density = useAppearanceStore((s) => s.density);
  const accent = useAppearanceStore((s) => s.accent);

  useEffect(() => {
    applyAppearance();
  }, [density, accent]);

  return null;
}
