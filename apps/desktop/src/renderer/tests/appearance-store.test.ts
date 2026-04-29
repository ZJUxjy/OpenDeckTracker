import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APPEARANCE_STORAGE_KEY, ACCENT_PALETTE } from '../src/stores/appearance-store';

describe('appearance store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('defaults to comfortable density and cyan accent when nothing is stored', async () => {
    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    expect(useAppearanceStore.getState().density).toBe('comfortable');
    expect(useAppearanceStore.getState().accent).toBe('cyan');
  });

  it('round-trips preferences through localStorage', async () => {
    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    useAppearanceStore.getState().setDensity('compact');
    useAppearanceStore.getState().setAccent('violet');

    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe(
      JSON.stringify({ density: 'compact', accent: 'violet', gameOverlay: false }),
    );

    // Fresh import hydrates from storage
    vi.resetModules();
    const { useAppearanceStore: fresh } = await import('../src/stores/appearance-store');
    expect(fresh.getState().density).toBe('compact');
    expect(fresh.getState().accent).toBe('violet');
  });

  it('falls back to defaults on malformed JSON', async () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, '{ this is not json');

    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    expect(useAppearanceStore.getState().density).toBe('comfortable');
    expect(useAppearanceStore.getState().accent).toBe('cyan');
  });

  it('falls back to defaults on unknown enum values', async () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ density: 'spacious', accent: 'red' }));

    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    expect(useAppearanceStore.getState().density).toBe('comfortable');
    expect(useAppearanceStore.getState().accent).toBe('cyan');
  });

  it('exports ACCENT_PALETTE with correct hex and rgba values', () => {
    expect(ACCENT_PALETTE).toEqual({
      cyan:   { accent: '#22d3ee', accentDim: 'rgba(34,211,238,0.15)' },
      teal:   { accent: '#2dd4bf', accentDim: 'rgba(45,212,191,0.15)' },
      violet: { accent: '#a78bfa', accentDim: 'rgba(167,139,250,0.15)' },
    });
  });

  it('defaults gameOverlay to false when nothing is stored', async () => {
    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    expect(useAppearanceStore.getState().gameOverlay).toBe(false);
  });

  it('round-trips gameOverlay through localStorage', async () => {
    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    useAppearanceStore.getState().setGameOverlay(true);

    const stored = JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY)!);
    expect(stored.gameOverlay).toBe(true);

    vi.resetModules();
    const { useAppearanceStore: fresh } = await import('../src/stores/appearance-store');
    expect(fresh.getState().gameOverlay).toBe(true);
  });

  it('handles legacy payload without gameOverlay gracefully', async () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ density: 'compact', accent: 'violet' }));

    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    expect(useAppearanceStore.getState().gameOverlay).toBe(false);
  });

  it('fires window.hdt.overlay.setEnabled when setGameOverlay is called', async () => {
    const setEnabled = vi.fn();
    (window as any).hdt = { overlay: { setEnabled } };

    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    useAppearanceStore.getState().setGameOverlay(true);
    expect(setEnabled).toHaveBeenCalledWith(true);

    useAppearanceStore.getState().setGameOverlay(false);
    expect(setEnabled).toHaveBeenCalledWith(false);

    (window as any).hdt = undefined;
  });
});
