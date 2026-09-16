import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';
import type { DownloadUpdateOptions, DownloadExecutorTask } from 'electron-updater/out/AppUpdater';

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), install: vi.fn(), quit: vi.fn() }));
vi.mock('electron', () => ({ app: { quit: mocks.quit } }));
vi.mock('./portable-update-helper', () => ({
  preparePortableUpdate: mocks.prepare,
  startPortableUpdate: mocks.install,
}));
vi.mock('electron-updater', () => ({
  default: {
    AppUpdater: class extends EventEmitter {
      async executeDownload(options: DownloadExecutorTask) {
        await options.done?.({
          version: '0.8.0',
          files: [],
          releaseDate: '',
          path: '',
          sha512: '',
          downloadedFile: 'update.zip',
        });
        return ['update.zip'];
      }
      dispatchUpdateDownloaded(info: unknown) {
        this.emit('update-downloaded', info);
      }
      dispatchError(error: Error) {
        this.emit('error', error);
      }
    },
  },
}));
import { PortableUpdater, selectPortableFile } from './portable-updater';

const zip = {
  url: new URL('https://example.com/OpenDeckTracker-0.8.0-win.zip'),
  info: { url: 'OpenDeckTracker-0.8.0-win.zip', sha512: 'hash', size: 100 },
};
const exe = {
  url: new URL('https://example.com/setup.exe'),
  info: { url: 'setup.exe', sha512: 'installer' },
};
const options = {
  updateInfoAndProvider: {
    info: { version: '0.8.0' },
    provider: { resolveFiles: () => [exe, zip] },
  },
} as unknown as DownloadUpdateOptions;
class TestUpdater extends PortableUpdater {
  download() {
    return this.doDownloadUpdate(options);
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.prepare.mockResolvedValue('plan.json');
  mocks.install.mockResolvedValue(undefined);
});
it('selects the Windows ZIP and refuses missing/malformed portable metadata', () => {
  expect(selectPortableFile([exe, zip], '0.8.0')).toBe(zip);
  expect(() => selectPortableFile([exe], '0.8.0')).toThrow(/ZIP/);
  expect(() => selectPortableFile([zip], '0.9.0')).toThrow(/ZIP/);
});
it('prepares before offering restart and only quits after helper readiness', async () => {
  const updater = new TestUpdater();
  const downloaded = vi.fn();
  updater.on('update-downloaded', downloaded);
  let finish!: (plan: string) => void;
  mocks.prepare.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const work = updater.download();
  expect(downloaded).not.toHaveBeenCalled();
  finish('plan.json');
  await work;
  expect(downloaded).toHaveBeenCalledOnce();
  expect(mocks.quit).not.toHaveBeenCalled();
  updater.quitAndInstall();
  await vi.waitFor(() => expect(mocks.quit).toHaveBeenCalledOnce());
  expect(mocks.install).toHaveBeenCalledWith('plan.json');
});
it('does not mark an invalid archive ready or quit when helper startup fails', async () => {
  const updater = new TestUpdater();
  const downloaded = vi.fn();
  const error = vi.fn();
  updater.on('update-downloaded', downloaded);
  updater.on('error', error);
  mocks.prepare.mockRejectedValueOnce(new Error('unsafe ZIP'));
  await expect(updater.download()).rejects.toThrow('unsafe ZIP');
  expect(downloaded).not.toHaveBeenCalled();
  expect(() => updater.quitAndInstall()).toThrow(/prepared/);
  await updater.download();
  mocks.install.mockRejectedValueOnce(new Error('helper blocked'));
  updater.quitAndInstall();
  await vi.waitFor(() => expect(error).toHaveBeenCalled());
  expect(mocks.quit).not.toHaveBeenCalled();
});
