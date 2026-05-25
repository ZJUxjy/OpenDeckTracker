import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APPEARANCE_STORAGE_KEY, ACCENT_PALETTE } from '../src/stores/appearance-store';

describe('appearance store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('defaults to comfortable density, Fallout 76 UI style, blue accent, system theme when nothing is stored', async () => {
    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    expect(useAppearanceStore.getState().density).toBe('comfortable');
    expect(useAppearanceStore.getState().uiStyle).toBe('fallout76');
    expect(useAppearanceStore.getState().accent).toBe('blue');
    expect(useAppearanceStore.getState().theme).toBe('system');
    expect(useAppearanceStore.getState().gameOverlay).toBe(true);
    expect(useAppearanceStore.getState().gameOverlayOpponent).toBe(true);
  });

  it('round-trips preferences through localStorage', async () => {
    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    useAppearanceStore.getState().setDensity('compact');
    useAppearanceStore.getState().setUiStyle('macos');
    useAppearanceStore.getState().setAccent('purple');
    useAppearanceStore.getState().setTheme('dark');

    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe(
      JSON.stringify({
        density: 'compact',
        uiStyle: 'macos',
        accent: 'purple',
        theme: 'dark',
        gameOverlay: true,
        gameOverlayOpponent: true,
      }),
    );

    // Fresh import hydrates from storage
    vi.resetModules();
    const { useAppearanceStore: fresh } = await import('../src/stores/appearance-store');
    expect(fresh.getState().density).toBe('compact');
    expect(fresh.getState().uiStyle).toBe('macos');
    expect(fresh.getState().accent).toBe('purple');
    expect(fresh.getState().theme).toBe('dark');
  });

  it('broadcasts appearance changes so overlay/layout windows can sync live', async () => {
    const broadcast = vi.fn(async () => undefined);
    (window as any).hdt = { appearance: { broadcast } };
    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    useAppearanceStore.getState().setUiStyle('macos');

    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledWith({
      density: 'comfortable',
      uiStyle: 'macos',
      accent: 'blue',
      theme: 'system',
      gameOverlay: true,
      gameOverlayOpponent: true,
    });
    (window as any).hdt = undefined;
  });

  it('syncs external appearance payloads without toggling overlay IPC', async () => {
    const setEnabled = vi.fn();
    (window as any).hdt = { overlay: { setEnabled } };
    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    useAppearanceStore.getState().syncFromExternal({
      density: 'compact',
      uiStyle: 'wechat',
      accent: 'purple',
      theme: 'dark',
      gameOverlay: true,
      gameOverlayOpponent: false,
    });

    expect(useAppearanceStore.getState().density).toBe('compact');
    expect(useAppearanceStore.getState().uiStyle).toBe('wechat');
    expect(useAppearanceStore.getState().accent).toBe('purple');
    expect(useAppearanceStore.getState().theme).toBe('dark');
    expect(useAppearanceStore.getState().gameOverlay).toBe(true);
    expect(setEnabled).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY)!)).toMatchObject({
      density: 'compact',
      uiStyle: 'wechat',
      accent: 'purple',
      theme: 'dark',
      gameOverlay: true,
    });
    (window as any).hdt = undefined;
  });

  it('round-trips the WeChat UI style through localStorage', async () => {
    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    useAppearanceStore.getState().setUiStyle('wechat');

    const stored = JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY)!);
    expect(stored.uiStyle).toBe('wechat');

    vi.resetModules();
    const { useAppearanceStore: fresh } = await import('../src/stores/appearance-store');
    expect(fresh.getState().uiStyle).toBe('wechat');
  });

  it('round-trips the Fallout 76 UI style through localStorage', async () => {
    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    useAppearanceStore.getState().setUiStyle('fallout76');

    const stored = JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY)!);
    expect(stored.uiStyle).toBe('fallout76');

    vi.resetModules();
    const { useAppearanceStore: fresh } = await import('../src/stores/appearance-store');
    expect(fresh.getState().uiStyle).toBe('fallout76');
  });

  it('falls back to defaults on malformed JSON', async () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, '{ this is not json');

    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    expect(useAppearanceStore.getState().density).toBe('comfortable');
    expect(useAppearanceStore.getState().uiStyle).toBe('fallout76');
    expect(useAppearanceStore.getState().accent).toBe('blue');
    expect(useAppearanceStore.getState().theme).toBe('system');
  });

  it('falls back to defaults on unknown enum values', async () => {
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ density: 'spacious', uiStyle: 'winamp', accent: 'banana', theme: 'sepia' }),
    );

    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    expect(useAppearanceStore.getState().density).toBe('comfortable');
    expect(useAppearanceStore.getState().uiStyle).toBe('fallout76');
    expect(useAppearanceStore.getState().accent).toBe('blue');
    expect(useAppearanceStore.getState().theme).toBe('system');
  });

  it('migrates legacy accent values (cyan/teal → mint, violet → purple)', async () => {
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ density: 'comfortable', accent: 'violet' }),
    );

    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    expect(useAppearanceStore.getState().accent).toBe('purple');
  });

  it('exports ACCENT_PALETTE with all 8 macOS system accents', () => {
    const expectedKeys = ['blue', 'red', 'orange', 'yellow', 'green', 'mint', 'purple', 'pink'];
    expect(Object.keys(ACCENT_PALETTE).sort()).toEqual(expectedKeys.sort());
    for (const key of expectedKeys) {
      const v = ACCENT_PALETTE[key as keyof typeof ACCENT_PALETTE];
      expect(v.accentLight).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(v.accentDark).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(v.accentDimLight).toMatch(/^rgba\(/);
      expect(v.accentDimDark).toMatch(/^rgba\(/);
    }
  });

  it('defaults gameOverlay to true when nothing is stored', async () => {
    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    expect(useAppearanceStore.getState().gameOverlay).toBe(true);
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
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ density: 'compact', accent: 'purple' }),
    );

    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    expect(useAppearanceStore.getState().gameOverlay).toBe(true);
  });

  it('handles legacy payload without uiStyle gracefully', async () => {
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ density: 'compact', accent: 'purple' }),
    );

    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    expect(useAppearanceStore.getState().uiStyle).toBe('fallout76');
    expect(useAppearanceStore.getState().density).toBe('compact');
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

  it('defaults gameOverlayOpponent to true when nothing is stored', async () => {
    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    expect(useAppearanceStore.getState().gameOverlayOpponent).toBe(true);
  });

  it('round-trips gameOverlayOpponent through localStorage', async () => {
    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    useAppearanceStore.getState().setGameOverlayOpponent(true);

    const stored = JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY)!);
    expect(stored.gameOverlayOpponent).toBe(true);

    vi.resetModules();
    const { useAppearanceStore: fresh } = await import('../src/stores/appearance-store');
    expect(fresh.getState().gameOverlayOpponent).toBe(true);
  });

  it('handles legacy payload without gameOverlayOpponent gracefully', async () => {
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ density: 'comfortable', accent: 'blue', gameOverlay: true }),
    );

    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    expect(useAppearanceStore.getState().gameOverlayOpponent).toBe(true);
    expect(useAppearanceStore.getState().gameOverlay).toBe(true);
  });

  it('fires window.hdt.overlay.setEnabledOpponent when setGameOverlayOpponent is called', async () => {
    const setEnabled = vi.fn();
    const setEnabledOpponent = vi.fn();
    (window as any).hdt = { overlay: { setEnabled, setEnabledOpponent } };

    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    useAppearanceStore.getState().setGameOverlayOpponent(true);
    expect(setEnabledOpponent).toHaveBeenCalledWith(true);
    expect(setEnabled).not.toHaveBeenCalled();

    useAppearanceStore.getState().setGameOverlayOpponent(false);
    expect(setEnabledOpponent).toHaveBeenCalledWith(false);

    (window as any).hdt = undefined;
  });

  it('setGameOverlayOpponent does not mutate gameOverlay', async () => {
    const { useAppearanceStore } = await import('../src/stores/appearance-store');

    useAppearanceStore.getState().setGameOverlay(true);
    useAppearanceStore.getState().setGameOverlayOpponent(true);

    expect(useAppearanceStore.getState().gameOverlay).toBe(true);
    expect(useAppearanceStore.getState().gameOverlayOpponent).toBe(true);

    useAppearanceStore.getState().setGameOverlayOpponent(false);
    expect(useAppearanceStore.getState().gameOverlay).toBe(true);
    expect(useAppearanceStore.getState().gameOverlayOpponent).toBe(false);
  });
});
