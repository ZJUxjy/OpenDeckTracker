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
    // The General / Tracker / Notifications / Data / Audio sidebar entries
    // were removed as part of the commercial-release Settings cleanup —
    // their panels were non-functional placeholders. Only categories with
    // real wired controls (plus the About panel) remain.
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

  it('shows language picker, density control, and accent swatches under Appearance', () => {
    renderSettings();

    // Appearance is the default active category, so its content is
    // visible without a sidebar click. (After the cleanup the heading
    // text "Appearance" also appears inside the panel, so getByText
    // alone is ambiguous — we just skip the click.)

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

  it('clicking Violet swatch updates the appearance store', async () => {
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Violet' }));

    const { useAppearanceStore } = await import('../src/stores/appearance-store');
    expect(useAppearanceStore.getState().accent).toBe('violet');
  });

  it('renders Chinese labels under zh-CN locale', () => {
    renderSettings('zh-CN');

    expect(screen.getByText('舒适')).toBeInTheDocument();
    expect(screen.getByText('紧凑')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '青色' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '蓝绿色' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '紫色' })).toBeInTheDocument();
  });
});
