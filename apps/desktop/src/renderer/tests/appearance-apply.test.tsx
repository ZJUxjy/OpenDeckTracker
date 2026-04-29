import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { APPEARANCE_STORAGE_KEY, ACCENT_PALETTE } from '../src/stores/appearance-store';

describe('AppearanceApplyEffect', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    // Reset inline styles and data attributes
    document.documentElement.style.removeProperty('--accent');
    document.documentElement.style.removeProperty('--accent-dim');
    document.documentElement.removeAttribute('data-density');
  });

  it('sets data-density and accent custom properties from store state on mount', async () => {
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ density: 'compact', accent: 'violet' }),
    );

    const { AppearanceApplyEffect } = await import('../src/components/AppearanceApplyEffect');

    render(<AppearanceApplyEffect />, {
      wrapper: ({ children }) => <>{children}</>,
    });

    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(ACCENT_PALETTE.violet.accent);
    expect(document.documentElement.style.getPropertyValue('--accent-dim')).toBe(ACCENT_PALETTE.violet.accentDim);
  });

  it('updates inline custom properties when accent changes', async () => {
    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    const { AppearanceApplyEffect } = await import('../src/components/AppearanceApplyEffect');

    render(<AppearanceApplyEffect />, {
      wrapper: ({ children }) => <>{children}</>,
    });

    act(() => {
      useAppearanceStore.getState().setAccent('violet');
    });

    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(ACCENT_PALETTE.violet.accent);
    expect(document.documentElement.style.getPropertyValue('--accent-dim')).toBe(ACCENT_PALETTE.violet.accentDim);
  });

  it('updates data-density when density changes', async () => {
    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    const { AppearanceApplyEffect } = await import('../src/components/AppearanceApplyEffect');

    render(<AppearanceApplyEffect />, {
      wrapper: ({ children }) => <>{children}</>,
    });

    act(() => {
      useAppearanceStore.getState().setDensity('compact');
    });

    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
  });

  it('inline properties persist after unmount (page-lifetime behavior)', async () => {
    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    const { AppearanceApplyEffect } = await import('../src/components/AppearanceApplyEffect');

    act(() => {
      useAppearanceStore.getState().setAccent('teal');
    });

    const { unmount } = render(<AppearanceApplyEffect />, {
      wrapper: ({ children }) => <>{children}</>,
    });

    unmount();

    // Properties should persist after unmount
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(ACCENT_PALETTE.teal.accent);
  });
});
