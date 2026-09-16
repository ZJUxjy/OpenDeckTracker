import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../src/i18n';
import { AppUpdatePanel } from '../src/components/AppUpdatePanel';
import type { AppUpdateStatus } from '../../shared/app-update';

let receive: (status: AppUpdateStatus) => void;
const off = vi.fn();
const api = {
  getStatus: vi.fn<() => Promise<AppUpdateStatus>>(),
  check: vi.fn<() => Promise<AppUpdateStatus>>(),
  download: vi.fn<() => Promise<AppUpdateStatus>>(),
  install: vi.fn<() => Promise<AppUpdateStatus>>(),
  openReleases: vi.fn(),
  onStatus: vi.fn((cb: typeof receive) => {
    receive = cb;
    return off;
  }),
};
function show(compact = false, locale: 'en-US' | 'zh-CN' = 'en-US') {
  return render(
    <I18nProvider preference={locale}>
      <AppUpdatePanel compact={compact} />
    </I18nProvider>,
  );
}

describe('update controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.hdt.updates = api;
    api.getStatus.mockResolvedValue({ state: 'idle' });
    api.check.mockResolvedValue({ state: 'up-to-date' });
    api.download.mockResolvedValue({ state: 'downloaded', version: '0.8.0' });
    api.install.mockResolvedValue({ state: 'installing', version: '0.8.0' });
  });

  it('discovers an update in the global notice and requires download and restart consent', async () => {
    const view = show(true);
    expect(screen.queryByRole('button', { name: 'Update now' })).not.toBeInTheDocument();
    act(() => receive({ state: 'update-available', version: '0.8.0' }));
    expect(api.download).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Update now' }));
    await screen.findByRole('button', { name: 'Restart and install' });
    expect(api.download).toHaveBeenCalledTimes(1);
    expect(api.install).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Restart and install' }));
    expect(api.install).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(api.install).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Restart and install' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm restart' }));
    await waitFor(() => expect(api.install).toHaveBeenCalledTimes(1));
    view.unmount();
    expect(off).toHaveBeenCalledTimes(1);
  });

  it('keeps pushed progress when an older status request resolves later', async () => {
    let resolve!: (status: AppUpdateStatus) => void;
    api.getStatus.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    show();
    act(() => receive({ state: 'downloading', version: '0.8.0', percent: 47 }));
    await act(async () => resolve({ state: 'idle' }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '47');
    expect(screen.getByRole('button', { name: 'Downloading…' })).toBeDisabled();
  });

  it('retries a rejected IPC action without leaving the button stuck', async () => {
    api.check.mockRejectedValueOnce(new Error('offline'));
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await screen.findByText("You're on the latest version.");
    expect(api.check).toHaveBeenCalledTimes(2);
  });

  it('shows Chinese progress and retries a failed download', async () => {
    api.getStatus.mockResolvedValue({
      state: 'error',
      retry: 'download',
      version: '0.8.0',
      message: 'offline',
    });
    show(false, 'zh-CN');
    fireEvent.click(await screen.findByRole('button', { name: '立即更新' }));
    await screen.findByRole('button', { name: '重启并安装' });
    expect(api.download).toHaveBeenCalledTimes(1);
  });

  it('offers the official download page for unsupported builds', async () => {
    api.getStatus.mockResolvedValue({ state: 'unsupported' });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Open downloads' }));
    await waitFor(() => expect(api.openReleases).toHaveBeenCalledTimes(1));
    expect(api.download).not.toHaveBeenCalled();
  });
});
