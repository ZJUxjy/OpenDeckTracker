import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import {
  APPEARANCE_STORAGE_KEY,
  APPEARANCE_V1_MACOS_RESET_KEY,
  ACCENT_PALETTE,
} from '../src/stores/appearance-store';

describe('AppearanceApplyEffect', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    // Reset inline styles and data attributes
    document.documentElement.style.removeProperty('--accent');
    document.documentElement.style.removeProperty('--accent-dim');
    document.documentElement.removeAttribute('data-density');
    document.documentElement.removeAttribute('data-ui-style');
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
  });

  it('sets data-density, data-ui-style, and accent custom properties from store state on mount', async () => {
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ density: 'compact', uiStyle: 'macos', accent: 'purple' }),
    );

    const { AppearanceApplyEffect } = await import('../src/components/AppearanceApplyEffect');

    render(<AppearanceApplyEffect />, {
      wrapper: ({ children }) => <>{children}</>,
    });

    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
    expect(document.documentElement.getAttribute('data-ui-style')).toBe('macos');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(ACCENT_PALETTE.purple.accentDark);
    expect(document.documentElement.style.getPropertyValue('--accent-dim')).toBe(ACCENT_PALETTE.purple.accentDimDark);
  });

  it('updates inline custom properties when accent changes', async () => {
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ density: 'comfortable', uiStyle: 'macos', accent: 'blue' }),
    );

    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    const { AppearanceApplyEffect } = await import('../src/components/AppearanceApplyEffect');

    render(<AppearanceApplyEffect />, {
      wrapper: ({ children }) => <>{children}</>,
    });

    act(() => {
      useAppearanceStore.getState().setAccent('purple');
    });

    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(ACCENT_PALETTE.purple.accentDark);
    expect(document.documentElement.style.getPropertyValue('--accent-dim')).toBe(ACCENT_PALETTE.purple.accentDimDark);
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

  it('updates data-ui-style when UI style changes', async () => {
    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    const { AppearanceApplyEffect } = await import('../src/components/AppearanceApplyEffect');

    render(<AppearanceApplyEffect />, {
      wrapper: ({ children }) => <>{children}</>,
    });

    expect(document.documentElement.getAttribute('data-ui-style')).toBe('macos');

    act(() => {
      useAppearanceStore.getState().setUiStyle('tavern');
    });

    expect(document.documentElement.getAttribute('data-ui-style')).toBe('tavern');

    act(() => {
      useAppearanceStore.getState().setUiStyle('wechat');
    });

    expect(document.documentElement.getAttribute('data-ui-style')).toBe('wechat');

    act(() => {
      useAppearanceStore.getState().setUiStyle('fallout76');
    });

    expect(document.documentElement.getAttribute('data-ui-style')).toBe('fallout76');
  });

  it('applies appearance updates broadcast from another renderer window', async () => {
    let onChanged: ((payload: unknown) => void) | null = null;
    const off = vi.fn();
    (window as any).hdt = {
      appearance: {
        onChanged: vi.fn((cb: (payload: unknown) => void) => {
          onChanged = cb;
          return off;
        }),
      },
    };

    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    const { AppearanceApplyEffect } = await import('../src/components/AppearanceApplyEffect');

    const { unmount } = render(<AppearanceApplyEffect />, {
      wrapper: ({ children }) => <>{children}</>,
    });

    expect(document.documentElement.getAttribute('data-ui-style')).toBe('macos');

    act(() => {
      onChanged?.({
        density: 'compact',
        uiStyle: 'macos',
        accent: 'purple',
        theme: 'light',
        gameOverlay: false,
        gameOverlayOpponent: false,
      });
    });

    expect(useAppearanceStore.getState().uiStyle).toBe('macos');
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
    expect(document.documentElement.getAttribute('data-ui-style')).toBe('macos');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(ACCENT_PALETTE.purple.accentLight);

    unmount();
    expect(off).toHaveBeenCalledTimes(1);
    (window as any).hdt = undefined;
  });

  it('forces dark color-scheme while the WeChat UI style is active', async () => {
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ density: 'comfortable', uiStyle: 'wechat', accent: 'blue', theme: 'light' }),
    );

    const { AppearanceApplyEffect } = await import('../src/components/AppearanceApplyEffect');

    render(<AppearanceApplyEffect />, {
      wrapper: ({ children }) => <>{children}</>,
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('forces dark color-scheme and terminal accent while the Fallout 76 UI style is active', async () => {
    // The v1 one-shot reset would flip a stored `fallout76` to `macos`
    // on first read. This test models a user who has *deliberately*
    // re-picked Fallout 76 after the reset already ran, so pre-stamp
    // the sentinel to opt out of migration.
    localStorage.setItem(APPEARANCE_V1_MACOS_RESET_KEY, '1');
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ density: 'comfortable', uiStyle: 'fallout76', accent: 'blue', theme: 'light' }),
    );

    const { AppearanceApplyEffect } = await import('../src/components/AppearanceApplyEffect');

    render(<AppearanceApplyEffect />, {
      wrapper: ({ children }) => <>{children}</>,
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#6DFF55');
  });

  it('inline properties persist after unmount (page-lifetime behavior)', async () => {
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ density: 'comfortable', uiStyle: 'macos', accent: 'blue' }),
    );

    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    const { AppearanceApplyEffect } = await import('../src/components/AppearanceApplyEffect');

    act(() => {
      useAppearanceStore.getState().setAccent('mint');
    });

    const { unmount } = render(<AppearanceApplyEffect />, {
      wrapper: ({ children }) => <>{children}</>,
    });

    unmount();

    // Properties should persist after unmount
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(ACCENT_PALETTE.mint.accentDark);
  });

  it('fires overlay:set-enabled on mount when gameOverlay is saved as true', async () => {
    const setEnabled = vi.fn();
    (window as any).hdt = { overlay: { setEnabled } };

    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ density: 'comfortable', accent: 'blue', gameOverlay: true }),
    );

    const { AppearanceApplyEffect } = await import('../src/components/AppearanceApplyEffect');

    render(<AppearanceApplyEffect />, {
      wrapper: ({ children }) => <>{children}</>,
    });

    expect(setEnabled).toHaveBeenCalledTimes(1);
    expect(setEnabled).toHaveBeenCalledWith(true);

    (window as any).hdt = undefined;
  });

  it('does not fire overlay:set-enabled on mount when gameOverlay is false', async () => {
    const setEnabled = vi.fn();
    (window as any).hdt = { overlay: { setEnabled } };

    const { AppearanceApplyEffect } = await import('../src/components/AppearanceApplyEffect');

    render(<AppearanceApplyEffect />, {
      wrapper: ({ children }) => <>{children}</>,
    });

    expect(setEnabled).not.toHaveBeenCalled();

    (window as any).hdt = undefined;
  });

  it('fires overlay:set-enabled-opponent on mount when gameOverlayOpponent is saved as true', async () => {
    const setEnabled = vi.fn();
    const setEnabledOpponent = vi.fn();
    (window as any).hdt = { overlay: { setEnabled, setEnabledOpponent } };

    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ density: 'comfortable', accent: 'blue', gameOverlay: false, gameOverlayOpponent: true }),
    );

    const { AppearanceApplyEffect } = await import('../src/components/AppearanceApplyEffect');

    render(<AppearanceApplyEffect />, {
      wrapper: ({ children }) => <>{children}</>,
    });

    expect(setEnabledOpponent).toHaveBeenCalledTimes(1);
    expect(setEnabledOpponent).toHaveBeenCalledWith(true);
    expect(setEnabled).not.toHaveBeenCalled();

    (window as any).hdt = undefined;
  });

  it('fires both player and opponent re-fires when both are saved as true', async () => {
    const setEnabled = vi.fn();
    const setEnabledOpponent = vi.fn();
    (window as any).hdt = { overlay: { setEnabled, setEnabledOpponent } };

    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ density: 'comfortable', accent: 'blue', gameOverlay: true, gameOverlayOpponent: true }),
    );

    const { AppearanceApplyEffect } = await import('../src/components/AppearanceApplyEffect');

    render(<AppearanceApplyEffect />, {
      wrapper: ({ children }) => <>{children}</>,
    });

    expect(setEnabled).toHaveBeenCalledTimes(1);
    expect(setEnabled).toHaveBeenCalledWith(true);
    expect(setEnabledOpponent).toHaveBeenCalledTimes(1);
    expect(setEnabledOpponent).toHaveBeenCalledWith(true);

    (window as any).hdt = undefined;
  });

  it('does not fire opponent re-fire when gameOverlayOpponent is false', async () => {
    const setEnabled = vi.fn();
    const setEnabledOpponent = vi.fn();
    (window as any).hdt = { overlay: { setEnabled, setEnabledOpponent } };

    const { AppearanceApplyEffect } = await import('../src/components/AppearanceApplyEffect');

    render(<AppearanceApplyEffect />, {
      wrapper: ({ children }) => <>{children}</>,
    });

    expect(setEnabledOpponent).not.toHaveBeenCalled();

    (window as any).hdt = undefined;
  });
});
