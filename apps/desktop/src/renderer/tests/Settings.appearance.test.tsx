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

  it('lists Appearance between General and Tracker in the sidebar', () => {
    renderSettings();

    const sidebarButtons = screen.getAllByRole('button');
    const sidebarLabels = sidebarButtons
      .map((b) => b.textContent?.trim())
      .filter((label) => label && ['General', 'Appearance', 'Deck Tracker'].includes(label));

    expect(sidebarLabels).toEqual(['General', 'Appearance', 'Deck Tracker']);
  });

  it('shows language picker, density control, and accent swatches under Appearance', () => {
    renderSettings();

    // Click Appearance category
    fireEvent.click(screen.getByText('Appearance'));

    // Language picker should be present
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();

    // Density control
    expect(screen.getByText('Comfortable')).toBeInTheDocument();
    expect(screen.getByText('Compact')).toBeInTheDocument();

    // Accent swatches use aria-label
    expect(screen.getByRole('button', { name: 'Cyan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Teal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Violet' })).toBeInTheDocument();
  });

  it('does NOT show language picker under General', () => {
    renderSettings();

    // General is the default active category
    expect(screen.queryByText('Language')).not.toBeInTheDocument();
  });

  it('clicking Violet swatch updates the appearance store', async () => {
    renderSettings();

    fireEvent.click(screen.getByText('Appearance'));
    fireEvent.click(screen.getByRole('button', { name: 'Violet' }));

    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    expect(useAppearanceStore.getState().accent).toBe('violet');
  });

  it('renders Chinese labels under zh-CN locale', () => {
    renderSettings('zh-CN');

    // Click 外观 (Appearance) in sidebar
    fireEvent.click(screen.getByText('外观'));

    expect(screen.getByText('舒适')).toBeInTheDocument();
    expect(screen.getByText('紧凑')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '青色' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '蓝绿色' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '紫色' })).toBeInTheDocument();
  });
});
