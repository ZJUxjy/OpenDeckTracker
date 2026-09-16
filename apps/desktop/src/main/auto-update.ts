import { app, BrowserWindow, ipcMain, shell } from 'electron';
import electronUpdater from 'electron-updater';
import type { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { APP_UPDATE_STATUS_CHANNEL, type AppUpdateStatus } from '../shared/app-update';
import { PortableUpdater } from './portable-updater';
import { takePortableUpdateError } from './portable-update-helper';

const RELEASES_URL = 'https://github.com/ZJUxjy/OpenDeckTracker/releases/latest';
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

interface Updater extends Pick<EventEmitter, 'on'> {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  disableWebInstaller?: boolean;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<string[]>;
  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void;
}

type ReleaseInfo = {
  version: string;
  releaseNotes?: string | { version: string; note: string | null }[] | null;
};

export function getUpdateDistribution(
  packaged: boolean,
  platform: string,
  hasUninstaller: boolean,
): 'unsupported' | 'installed' | 'portable' {
  if (!packaged || platform !== 'win32') return 'unsupported';
  return hasUninstaller ? 'installed' : 'portable';
}

/** One source of truth for startup checks, settings and the desktop notice. */
export function createUpdateController(
  updater: Updater,
  supported: boolean,
  publish: (status: AppUpdateStatus) => void,
  previousError?: string,
) {
  let status: AppUpdateStatus =
    previousError && supported
      ? { state: 'error', retry: 'check', message: previousError }
      : { state: supported ? 'idle' : 'unsupported' };
  let pending: Promise<AppUpdateStatus> | undefined;
  let operation: 'check' | 'download' | 'install' = 'check';
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.disableWebInstaller = true;

  const set = (next: AppUpdateStatus) => {
    status = { ...next };
    if (status.state !== 'error') {
      delete status.message;
      delete status.retry;
    }
    publish({ ...status });
  };
  const fail = (error: unknown) => {
    set({
      ...status,
      state: 'error',
      retry: operation,
      message: error instanceof Error ? error.message : String(error),
    });
  };
  updater.on('update-available', (info: ReleaseInfo) => {
    const notes =
      typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : (info.releaseNotes?.map((entry) => entry.note ?? '').join('\n') ?? '');
    set({ state: 'update-available', version: info.version, releaseNotes: notes.slice(0, 20000) });
  });
  updater.on('update-not-available', () => set({ state: 'up-to-date' }));
  updater.on('download-progress', (progress: { percent: number }) => {
    if (status.state === 'downloading')
      set({ ...status, percent: Math.min(100, Math.max(0, progress.percent || 0)) });
  });
  updater.on('update-downloaded', (info: ReleaseInfo) => {
    set({ ...status, state: 'downloaded', version: info.version, percent: 100 });
  });
  updater.on('error', fail);

  async function run(action: 'check' | 'download', work: () => Promise<unknown>) {
    operation = action;
    set(
      action === 'check' ? { state: 'checking' } : { ...status, state: 'downloading', percent: 0 },
    );
    pending = (async () => {
      try {
        await work();
        if (status.state === 'checking') set({ state: 'up-to-date' });
      } catch (error) {
        fail(error);
      }
      return { ...status };
    })();
    try {
      return await pending;
    } finally {
      pending = undefined;
    }
  }

  return {
    getStatus: (): AppUpdateStatus => ({ ...status }),
    check: async (): Promise<AppUpdateStatus> => {
      if (
        !supported ||
        ['downloading', 'downloaded', 'installing'].includes(status.state) ||
        (status.state === 'error' && status.retry === 'install')
      )
        return { ...status };
      if (pending) return pending;
      return run('check', () => updater.checkForUpdates());
    },
    download: async (): Promise<AppUpdateStatus> => {
      if (!supported) return { ...status };
      if (pending) return pending;
      if (
        status.state !== 'update-available' &&
        !(status.state === 'error' && status.retry === 'download')
      )
        return { ...status };
      return run('download', () => updater.downloadUpdate());
    },
    install: async (): Promise<AppUpdateStatus> => {
      if (
        !supported ||
        pending ||
        (status.state !== 'downloaded' && !(status.state === 'error' && status.retry === 'install'))
      )
        return { ...status };
      operation = 'install';
      set({ ...status, state: 'installing' });
      try {
        updater.quitAndInstall(true, true);
      } catch (error) {
        fail(error);
      }
      return { ...status };
    },
  };
}

let controller: ReturnType<typeof createUpdateController> | undefined;

export function getUpdateController() {
  if (!controller) {
    const distribution = getUpdateDistribution(
      app.isPackaged,
      process.platform,
      existsSync(join(dirname(app.getPath('exe')), 'Uninstall OpenDeckTracker.exe')),
    );
    const updater =
      distribution === 'portable' ? new PortableUpdater() : electronUpdater.autoUpdater;
    controller = createUpdateController(
      updater,
      distribution !== 'unsupported',
      (status) => {
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed() && !window.webContents.isDestroyed())
            window.webContents.send(APP_UPDATE_STATUS_CHANNEL, status);
        }
      },
      distribution === 'portable' ? takePortableUpdateError() : undefined,
    );
  }
  return controller;
}

export function initAutoUpdate(): void {
  const updates = getUpdateController();
  ipcMain.handle('app-update:get-status', () => updates.getStatus());
  ipcMain.handle('app-update:check', () => updates.check());
  ipcMain.handle('app-update:download', () => updates.download());
  ipcMain.handle('app-update:install', () => updates.install());
  ipcMain.handle('app-update:open-releases', () => shell.openExternal(RELEASES_URL));
  if (updates.getStatus().state === 'unsupported') return;
  if (updates.getStatus().state === 'idle') void updates.check();
  const timer = setInterval(() => {
    void updates.check();
  }, SIX_HOURS_MS);
  timer.unref();
  app.once('before-quit', () => clearInterval(timer));
}
