import { BrowserWindow, ipcMain } from 'electron';
import type { PopularDeckSyncOrchestrator, SyncProgress } from './index';

export const SYNC_PROGRESS_CHANNEL = 'popular-decks:sync-progress';
export const SYNC_START_CHANNEL = 'popular-decks:sync-start';
export const SYNC_STATUS_CHANNEL = 'popular-decks:sync-status';

/**
 * Wires the sync orchestrator into Electron IPC. Call once at boot
 * after constructing the orchestrator. Returns a `dispose()` for tests
 * (and main-process teardown) that removes the registered handlers.
 */
export function registerPopularDecksSyncIpc(
  orchestrator: PopularDeckSyncOrchestrator,
): () => void {
  ipcMain.handle(SYNC_START_CHANNEL, async () => {
    return orchestrator.startSync(broadcastProgress);
  });

  ipcMain.handle(SYNC_STATUS_CHANNEL, () => orchestrator.getStatus());

  return () => {
    ipcMain.removeHandler(SYNC_START_CHANNEL);
    ipcMain.removeHandler(SYNC_STATUS_CHANNEL);
  };
}

function broadcastProgress(progress: SyncProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(SYNC_PROGRESS_CHANNEL, progress);
    }
  }
}
