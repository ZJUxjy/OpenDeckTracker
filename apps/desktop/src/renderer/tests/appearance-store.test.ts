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
      JSON.stringify({ density: 'compact', accent: 'violet' }),
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
});
