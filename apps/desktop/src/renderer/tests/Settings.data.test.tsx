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

describe('Settings — Data category', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    const onProgress = vi.fn();
    (window as unknown as { hdt: unknown }).hdt = {
      app: {
        getVersion: vi.fn().mockResolvedValue('0.1.0'),
      },
      about: {
        checkForUpdates: vi.fn().mockResolvedValue({ state: 'up-to-date' }),
        openLicense: vi.fn().mockResolvedValue(true),
        openThirdPartyNotices: vi.fn().mockResolvedValue(true),
      },
      cardImages: {
        bulkDownload: {
          getStatus: vi.fn().mockResolvedValue({
            state: 'idle',
            progress: { completed: 0, total: 0, failed: 0, currentCardId: null },
            stats: {
              downloadedRenders: 0,
              downloadedTiles: 0,
              skippedRenders: 0,
              skippedTiles: 0,
              failed: 0,
            },
          }),
          start: vi.fn().mockResolvedValue({
            ok: true,
            status: {
              state: 'running',
              progress: { completed: 0, total: 100, failed: 0, currentCardId: null },
              stats: {
                downloadedRenders: 0,
                downloadedTiles: 0,
                skippedRenders: 0,
                skippedTiles: 0,
                failed: 0,
              },
            },
          }),
          pause: vi.fn(),
          resume: vi.fn(),
          abort: vi.fn(),
          onProgress,
        },
      },
    };
  });

  it('renders the data category and starts a download', async () => {
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Data & Sync' }));

    await waitFor(() => {
      expect(screen.getByText('Card images')).toBeInTheDocument();
    });

    const downloadButton = screen.getByRole('button', { name: 'Download' });
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(window.hdt.cardImages.bulkDownload.start).toHaveBeenCalledWith(['render', 'tile']);
    });
  });

  it('renders Chinese strings under zh-CN', async () => {
    renderSettings('zh-CN');

    fireEvent.click(screen.getByRole('button', { name: '数据与同步' }));

    await waitFor(() => {
      expect(screen.getByText('卡牌图片')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: '下载' })).toBeInTheDocument();
  });
});
