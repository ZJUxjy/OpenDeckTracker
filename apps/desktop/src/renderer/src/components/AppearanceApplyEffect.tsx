import { useEffect, useRef } from 'react';
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
  const bootOverlayFired = useRef(false);

  useEffect(() => {
    applyAppearance();
  }, [density, accent]);

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
