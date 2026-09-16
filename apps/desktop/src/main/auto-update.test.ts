import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: {}, BrowserWindow: {}, ipcMain: {}, shell: {} }));
vi.mock('electron-updater', () => ({ default: { autoUpdater: {} } }));
vi.mock('./portable-updater', () => ({ PortableUpdater: vi.fn() }));
import { createUpdateController, getUpdateDistribution } from './auto-update';

function setup(supported = true) {
  const updater = Object.assign(new EventEmitter(), {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    allowDowngrade: true,
    checkForUpdates: vi.fn(async () => {
      updater.emit('update-available', { version: '0.8.0', releaseNotes: 'New features' });
      return { isUpdateAvailable: true };
    }),
    downloadUpdate: vi.fn(async () => {
      updater.emit('download-progress', { percent: 42 });
      updater.emit('update-downloaded', { version: '0.8.0' });
      return ['installer.exe'];
    }),
    quitAndInstall: vi.fn(),
  });
  const publish = vi.fn();
  const controller = createUpdateController(updater, supported, publish);
  return { updater, controller, publish };
}

describe('desktop update lifecycle', () => {
  it('retains a previous portable recovery error until a new check is requested', async () => {
    const { updater } = setup();
    const controller = createUpdateController(
      updater,
      true,
      vi.fn(),
      'File locked; old files restored',
    );
    expect(controller.getStatus()).toMatchObject({
      state: 'error',
      retry: 'check',
      message: 'File locked; old files restored',
    });
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    await controller.check();
    expect(controller.getStatus().state).toBe('update-available');
  });
  it('checks without downloading and installs only after explicit consent', async () => {
    const { updater, controller, publish } = setup();
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.allowDowngrade).toBe(false);
    await controller.install();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    await controller.check();
    expect(controller.getStatus()).toMatchObject({ state: 'update-available', version: '0.8.0' });
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    await controller.download();
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'downloading', percent: 42 }),
    );
    expect(controller.getStatus().state).toBe('downloaded');
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    await controller.check();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    await controller.install();
    await controller.install();
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true);
  });

  it('deduplicates checks and downloads, protecting an in-flight update', async () => {
    const { updater, controller } = setup();
    let finish!: () => void;
    updater.checkForUpdates.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => {
            updater.emit('update-available', { version: '0.8.0' });
            resolve({ isUpdateAvailable: true });
          };
        }),
    );
    const first = controller.check();
    const second = controller.check();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([first, second]);
    updater.downloadUpdate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => {
            updater.emit('update-downloaded', { version: '0.8.0' });
            resolve(['installer.exe']);
          };
        }),
    );
    const download = controller.download();
    await controller.check();
    const duplicate = controller.download();
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([download, duplicate]);
    expect(controller.getStatus().state).toBe('downloaded');
  });

  it('recovers from check and download failures without installing invalid files', async () => {
    const { updater, controller } = setup();
    updater.checkForUpdates.mockRejectedValueOnce(new Error('offline'));
    expect(await controller.check()).toMatchObject({
      state: 'error',
      retry: 'check',
      message: 'offline',
    });
    await controller.check();
    updater.downloadUpdate.mockRejectedValueOnce(new Error('checksum mismatch'));
    expect(await controller.download()).toMatchObject({ state: 'error', retry: 'download' });
    await controller.install();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    await controller.download();
    expect(controller.getStatus().state).toBe('downloaded');
    expect(controller.getStatus().message).toBeUndefined();
    expect(controller.getStatus().retry).toBeUndefined();
  });

  it('uses update availability events rather than unequal version strings', async () => {
    const { updater, controller } = setup();
    updater.checkForUpdates.mockImplementationOnce(async () => {
      updater.emit('update-not-available', { version: '0.6.0' });
      return { isUpdateAvailable: false };
    });
    expect(await controller.check()).toEqual({ state: 'up-to-date' });
  });

  it('never checks, downloads or installs in unsupported distributions', async () => {
    const { updater, controller } = setup(false);
    expect(await controller.check()).toEqual({ state: 'unsupported' });
    await controller.download();
    await controller.install();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    expect(getUpdateDistribution(false, 'win32', true)).toBe('unsupported');
    expect(getUpdateDistribution(true, 'win32', false)).toBe('portable');
    expect(getUpdateDistribution(true, 'darwin', true)).toBe('unsupported');
    expect(getUpdateDistribution(true, 'win32', true)).toBe('installed');
  });
});
