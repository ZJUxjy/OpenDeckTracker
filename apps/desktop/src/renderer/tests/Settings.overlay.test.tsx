import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../src/i18n';
import { Settings } from '../src/components/Settings';

function renderSettings(locale?: string) {
  return render(
    <I18nProvider {...(locale ? { preference: locale as 'en-US' | 'zh-CN' } : {})}>
      <Settings />
    </I18nProvider>,
  );
}

describe('Settings — Overlay category', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    (window as any).hdt = { overlay: { setEnabled: vi.fn(), setEnabledOpponent: vi.fn() } };
  });

  it('shows the overlay enable toggle when Overlay category is selected', () => {
    renderSettings();
    fireEvent.click(screen.getByText('In-Game Overlay'));

    expect(screen.getByText('Show in-game overlay')).toBeInTheDocument();
  });

  it('does NOT show the "Section Under Construction" placeholder under Overlay', () => {
    renderSettings();
    fireEvent.click(screen.getByText('In-Game Overlay'));

    expect(screen.queryByText('Section Under Construction')).not.toBeInTheDocument();
  });

  it('does not surface a Notifications sidebar entry (placeholder category was removed)', () => {
    // Notifications/Data/Audio panels were placeholder-only; their sidebar
    // entries were removed as part of the commercial-release Settings cleanup.
    renderSettings();

    expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
  });

  it('toggling the overlay switch updates the appearance store', async () => {
    renderSettings();
    fireEvent.click(screen.getByText('In-Game Overlay'));

    const toggle = screen.getByText('Show in-game overlay').closest('.settings-row')!.querySelector('button')!;
    fireEvent.click(toggle);

    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    expect(useAppearanceStore.getState().gameOverlay).toBe(true);
  });

  it('toggle reflects the current store state on render', async () => {
    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    useAppearanceStore.getState().setGameOverlay(true);

    renderSettings();
    fireEvent.click(screen.getByText('In-Game Overlay'));

    const toggle = screen.getByText('Show in-game overlay').closest('.settings-row')!.querySelector('button')!;
    expect(toggle.className).toContain('bg-accent');
  });

  it('renders Chinese labels under zh-CN locale', () => {
    renderSettings('zh-CN');
    fireEvent.click(screen.getByText('游戏内覆盖层'));

    expect(screen.getByText('显示游戏内覆盖层')).toBeInTheDocument();
    expect(screen.getByText('仅在炉石传说运行时激活')).toBeInTheDocument();
  });

  it('shows BOTH player and opponent overlay toggle rows under Overlay category', () => {
    renderSettings();
    fireEvent.click(screen.getByText('In-Game Overlay'));

    expect(screen.getByText('Show in-game overlay')).toBeInTheDocument();
    expect(screen.getByText('Show opponent overlay')).toBeInTheDocument();
  });

  it('clicking the opponent toggle flips gameOverlayOpponent and invokes setEnabledOpponent IPC', async () => {
    const setEnabledOpponent = vi.fn();
    (window as any).hdt = { overlay: { setEnabled: vi.fn(), setEnabledOpponent } };
    renderSettings();
    fireEvent.click(screen.getByText('In-Game Overlay'));

    const opponentToggle = screen.getByText('Show opponent overlay').closest('.settings-row')!.querySelector('button')!;
    fireEvent.click(opponentToggle);

    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    expect(useAppearanceStore.getState().gameOverlayOpponent).toBe(true);
    expect(setEnabledOpponent).toHaveBeenCalledWith(true);
  });

  it('clicking the player toggle does NOT visually flip the opponent toggle', () => {
    renderSettings();
    fireEvent.click(screen.getByText('In-Game Overlay'));

    const opponentToggle = screen.getByText('Show opponent overlay').closest('.settings-row')!.querySelector('button')!;
    const opponentBefore = opponentToggle.className;

    const playerToggle = screen.getByText('Show in-game overlay').closest('.settings-row')!.querySelector('button')!;
    fireEvent.click(playerToggle);

    // Player toggle's class should change (flipped); opponent toggle's class should not.
    expect(opponentToggle.className).toBe(opponentBefore);
  });

  it('opponent toggle reflects the current store state on render', async () => {
    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    useAppearanceStore.getState().setGameOverlayOpponent(true);

    renderSettings();
    fireEvent.click(screen.getByText('In-Game Overlay'));

    const opponentToggle = screen.getByText('Show opponent overlay').closest('.settings-row')!.querySelector('button')!;
    expect(opponentToggle.className).toContain('bg-accent');
  });

  it('renders Chinese labels for the opponent toggle under zh-CN locale', () => {
    renderSettings('zh-CN');
    fireEvent.click(screen.getByText('游戏内覆盖层'));

    expect(screen.getByText('显示对手覆盖层')).toBeInTheDocument();
  });
});
