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
    (window as any).hdt = { overlay: { setEnabled: vi.fn() } };
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

  it('still shows "Section Under Construction" for notifications', () => {
    renderSettings();
    fireEvent.click(screen.getByText('Notifications'));

    expect(screen.getByText('Section Under Construction')).toBeInTheDocument();
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
});
