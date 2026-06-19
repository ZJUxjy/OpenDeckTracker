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

  it('shows language picker, the two UI-style options, and density under Appearance', () => {
    renderSettings();

    expect(screen.getAllByText('System').length).toBeGreaterThan(0);
    expect(screen.getByText('English')).toBeInTheDocument();

    // Two skins remain: Arcane (reference) and macOS.
    expect(screen.getByText('Arcane')).toBeInTheDocument();
    expect(screen.getByText('macOS')).toBeInTheDocument();
    // Removed skins are gone from the switcher.
    expect(screen.queryByText('Fallout 76')).not.toBeInTheDocument();
    expect(screen.queryByText('Tavern')).not.toBeInTheDocument();
    expect(screen.queryByText('WeChat Dark')).not.toBeInTheDocument();

    expect(screen.getByText('Comfortable')).toBeInTheDocument();
    expect(screen.getByText('Compact')).toBeInTheDocument();

    // Theme + accent are macOS-only; hidden while the reference skin is active.
    expect(screen.queryByText('Light')).not.toBeInTheDocument();
    expect(screen.queryByText('Dark')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Blue' })).not.toBeInTheDocument();
  });

  it('reveals the theme picker and accent swatches only after selecting macOS', () => {
    renderSettings();

    expect(screen.queryByText('Light')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('macOS'));

    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();
    for (const name of ['Blue', 'Red', 'Orange', 'Yellow', 'Green', 'Mint', 'Purple', 'Pink']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('clicking the macOS UI style button sets the macos UI style', async () => {
    renderSettings();

    fireEvent.click(screen.getByText('macOS'));

    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    expect(useAppearanceStore.getState().uiStyle).toBe('macos');
  });

  it('clicking Purple swatch updates the appearance store under the macOS skin', async () => {
    renderSettings();
    fireEvent.click(screen.getByText('macOS'));

    fireEvent.click(screen.getByRole('button', { name: 'Purple' }));

    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    expect(useAppearanceStore.getState().accent).toBe('purple');
  });

  it('clicking Arcane UI style button keeps the reference UI style', async () => {
    renderSettings();

    fireEvent.click(screen.getByText('Arcane'));

    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    expect(useAppearanceStore.getState().uiStyle).toBe('reference');
  });

  it('clicking Light theme button updates theme to light under the macOS skin', async () => {
    renderSettings();
    fireEvent.click(screen.getByText('macOS'));

    fireEvent.click(screen.getByText('Light'));

    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    expect(useAppearanceStore.getState().theme).toBe('light');
  });

  it('renders Chinese labels under zh-CN locale', () => {
    renderSettings('zh-CN');

    expect(screen.getByText('舒适')).toBeInTheDocument();
    expect(screen.getByText('紧凑')).toBeInTheDocument();
    expect(screen.getByText('奥术')).toBeInTheDocument();
    expect(screen.getByText('macOS')).toBeInTheDocument();
    expect(screen.queryByText('Fallout 76')).not.toBeInTheDocument();
    expect(screen.queryByText('酒馆')).not.toBeInTheDocument();
    expect(screen.queryByText('微信深色')).not.toBeInTheDocument();
  });

  it('renders the macOS theme picker labels in Chinese after selecting macOS', () => {
    renderSettings('zh-CN');

    fireEvent.click(screen.getByText('macOS'));

    // Theme picker labels in Chinese
    expect(screen.getByText('浅色')).toBeInTheDocument();
    expect(screen.getByText('深色')).toBeInTheDocument();
    // Accent swatches use English aria-labels (system names) — they're
    // proper-noun colors in macOS and stay untranslated, matching how
    // System Settings displays them.
    expect(screen.getByRole('button', { name: 'Blue' })).toBeInTheDocument();
  });

  it('keeps the settings page bounded while the sidebar and detail pane scroll', () => {
    const { container } = renderSettings();

    expect(container.firstElementChild).toHaveClass('h-full', 'min-h-0');
    expect(container.querySelector('[data-testid="settings-content-row"]')).toHaveClass('min-h-0');
  });
});
