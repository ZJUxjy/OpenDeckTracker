import { app, BrowserWindow, ipcMain } from 'electron';
import {
  createHearthWatcher,
  type HearthWatcherDiagnostic,
  type PowerEvent,
} from '@hdt/hearthwatcher';

let watcher: ReturnType<typeof createHearthWatcher> | null = null;
let latestStatus: HearthWatcherDiagnostic | null = null;

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

export function startHearthWatcher(): void {
  if (watcher !== null) return;
  watcher = createHearthWatcher();
  watcher.onStatus((status) => {
    latestStatus = status;
    broadcast('hearthwatcher:status', status);
  });
  watcher.onEvent((event: PowerEvent) => {
    broadcast('hearthwatcher:event', event);
  });

  void watcher.start().catch((error: unknown) => {
    latestStatus = {
      kind: 'missing-log',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
    };
    broadcast('hearthwatcher:status', latestStatus);
  });

  app.on('before-quit', () => {
    watcher?.stop();
    watcher = null;
  });
}

export function registerHearthWatcherIpc(): void {
  ipcMain.handle('hearthwatcher:get-status', (): HearthWatcherDiagnostic | null => {
    return latestStatus;
  });
}
