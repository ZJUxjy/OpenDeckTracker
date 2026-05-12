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

describe('Settings — Appearance category', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('exposes Appearance, Overlay, and About in the sidebar (placeholder categories hidden)', () => {
    renderSettings();

    const sidebarButtons = screen.getAllByRole('button');
    const sidebarLabels = sidebarButtons
      .map((b) => b.textContent?.trim())
      .filter((label) =>
        label &&
        ['General', 'Appearance', 'Deck Tracker', 'In-Game Overlay', 'Notifications', 'Data', 'Audio', 'About'].includes(label),
      );

    expect(sidebarLabels).toEqual(['Appearance', 'In-Game Overlay', 'About']);
  });

  it('shows language picker, UI style, density control, theme picker, and accent swatches under Appearance', () => {
    renderSettings();

    // Appearance is the default active category. Multiple "System" buttons
    // exist (Language, Theme), so we use queryAllByText for that one.
    expect(screen.getAllByText('System').length).toBeGreaterThan(0);
    expect(screen.getByText('English')).toBeInTheDocument();

    expect(screen.getByText('Tavern')).toBeInTheDocument();
    expect(screen.getByText('macOS')).toBeInTheDocument();
    expect(screen.getByText('WeChat Dark')).toBeInTheDocument();

    expect(screen.getByText('Comfortable')).toBeInTheDocument();
    expect(screen.getByText('Compact')).toBeInTheDocument();

    // Theme picker (System / Light / Dark)
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();

    // 8 macOS System accent swatches
    for (const name of ['Blue', 'Red', 'Orange', 'Yellow', 'Green', 'Mint', 'Purple', 'Pink']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('clicking Purple swatch updates the appearance store', async () => {
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Purple' }));

    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    expect(useAppearanceStore.getState().accent).toBe('purple');
  });

  it('clicking macOS UI style button updates UI style', async () => {
    renderSettings();

    fireEvent.click(screen.getByText('macOS'));

    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    expect(useAppearanceStore.getState().uiStyle).toBe('macos');
  });

  it('clicking WeChat UI style button updates UI style', async () => {
    renderSettings();

    fireEvent.click(screen.getByText('WeChat Dark'));

    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    expect(useAppearanceStore.getState().uiStyle).toBe('wechat');
  });

  it('clicking Light theme button updates theme to light', async () => {
    renderSettings();

    fireEvent.click(screen.getByText('Light'));

    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    expect(useAppearanceStore.getState().theme).toBe('light');
  });

  it('renders Chinese labels under zh-CN locale', () => {
    renderSettings('zh-CN');

    expect(screen.getByText('舒适')).toBeInTheDocument();
    expect(screen.getByText('紧凑')).toBeInTheDocument();
    expect(screen.getByText('酒馆')).toBeInTheDocument();
    expect(screen.getByText('macOS')).toBeInTheDocument();
    expect(screen.getByText('微信深色')).toBeInTheDocument();
    // Theme picker labels in Chinese
    expect(screen.getByText('浅色')).toBeInTheDocument();
    expect(screen.getByText('深色')).toBeInTheDocument();
    // Accent swatches use English aria-labels (system names) — they're
    // proper-noun colors in macOS and stay untranslated, matching how
    // System Settings displays them.
    expect(screen.getByRole('button', { name: 'Blue' })).toBeInTheDocument();
  });
});
