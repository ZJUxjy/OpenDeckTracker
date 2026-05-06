import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

describe('Settings — About category', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    (window as unknown as { hdt: unknown }).hdt = {
      app: {
        getVersion: vi.fn().mockResolvedValue('0.1.0'),
      },
      about: {
        checkForUpdates: vi.fn().mockResolvedValue({ state: 'up-to-date' }),
        openLicense: vi.fn().mockResolvedValue(true),
        openThirdPartyNotices: vi.fn().mockResolvedValue(true),
      },
    };
  });

  it('renders the version pulled from window.hdt.app.getVersion', async () => {
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'About' }));

    await waitFor(() => {
      expect(screen.getByText(/Version 0\.1\.0/)).toBeInTheDocument();
    });
  });

  it('shows "up to date" after a successful check', async () => {
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    // Click the Check-for-updates ACTION button (not the sidebar one).
    // After the click the button label switches to "Checking…", then back.
    const allButtons = screen.getAllByRole('button', { name: 'Check for updates' });
    // The action button is the one inside the settings-row card; sidebar
    // button has the same accessible name. Find by parent class.
    const actionButton = allButtons.find((b) => !b.classList.contains('rounded-lg'));
    expect(actionButton).toBeDefined();
    fireEvent.click(actionButton!);

    await waitFor(() => {
      expect(screen.getByText("You're on the latest version.")).toBeInTheDocument();
    });
  });

  it('shows the unsupported message when running unpackaged', async () => {
    (window as unknown as { hdt: { about: { checkForUpdates: ReturnType<typeof vi.fn> } } }).hdt.about
      .checkForUpdates = vi.fn().mockResolvedValue({ state: 'unsupported' });

    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    const allButtons = screen.getAllByRole('button', { name: 'Check for updates' });
    const actionButton = allButtons.find((b) => !b.classList.contains('rounded-lg'));
    fireEvent.click(actionButton!);

    await waitFor(() => {
      expect(
        screen.getByText('Auto-update is only available in packaged builds.'),
      ).toBeInTheDocument();
    });
  });

  it('surfaces an "update available" message with the version', async () => {
    (window as unknown as { hdt: { about: { checkForUpdates: ReturnType<typeof vi.fn> } } }).hdt.about
      .checkForUpdates = vi.fn().mockResolvedValue({
      state: 'update-available',
      version: '0.2.0',
    });

    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    const allButtons = screen.getAllByRole('button', { name: 'Check for updates' });
    const actionButton = allButtons.find((b) => !b.classList.contains('rounded-lg'));
    fireEvent.click(actionButton!);

    await waitFor(() => {
      expect(screen.getByText(/0\.2\.0/)).toBeInTheDocument();
    });
  });

  it('invokes the openLicense / openThirdPartyNotices IPC bindings', async () => {
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'About' }));

    fireEvent.click(screen.getByRole('button', { name: 'View License' }));
    await waitFor(() => {
      expect(window.hdt.about.openLicense).toHaveBeenCalledOnce();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Third-Party Notices' }));
    await waitFor(() => {
      expect(window.hdt.about.openThirdPartyNotices).toHaveBeenCalledOnce();
    });
  });

  it('renders the Blizzard / not-affiliated disclaimer', () => {
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'About' }));

    expect(screen.getByText(/not affiliated with/)).toBeInTheDocument();
    expect(screen.getByText(/Blizzard Entertainment/)).toBeInTheDocument();
  });

  it('renders Chinese strings under zh-CN', async () => {
    renderSettings('zh-CN');

    fireEvent.click(screen.getByRole('button', { name: '关于' }));

    await waitFor(() => {
      expect(screen.getByText(/版本 0\.1\.0/)).toBeInTheDocument();
    });
    expect(screen.getByText(/与暴雪娱乐/)).toBeInTheDocument();
  });
});
