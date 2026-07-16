import { BrowserWindow, ipcMain } from 'electron';
import type {
  BulkDownloadProgressCallback,
  CardImageBulkDownloadOrchestrator,
} from './orchestrator';
import {
  CARD_IMAGE_BULK_DOWNLOAD_ABORT_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_PAUSE_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_PROGRESS_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_RESUME_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_STATUS_CHANNEL,
} from '../../shared/ipc-channels';

export {
  CARD_IMAGE_BULK_DOWNLOAD_ABORT_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_PAUSE_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_PROGRESS_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_RESUME_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_STATUS_CHANNEL,
};

export function registerCardImageBulkDownloadIpc(
  orchestrator: CardImageBulkDownloadOrchestrator,
): () => void {
  const progressCb: BulkDownloadProgressCallback = (status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(CARD_IMAGE_BULK_DOWNLOAD_PROGRESS_CHANNEL, status);
      }
    }
  };

  ipcMain.handle(
    CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL,
    async (_, types: import('./index').BulkDownloadType[], force?: boolean) =>
      orchestrator.start(types, progressCb, force),
  );
  ipcMain.handle(CARD_IMAGE_BULK_DOWNLOAD_PAUSE_CHANNEL, () => orchestrator.pause());
  ipcMain.handle(CARD_IMAGE_BULK_DOWNLOAD_RESUME_CHANNEL, async () => orchestrator.resume(progressCb));
  ipcMain.handle(CARD_IMAGE_BULK_DOWNLOAD_ABORT_CHANNEL, () => orchestrator.abort());
  ipcMain.handle(CARD_IMAGE_BULK_DOWNLOAD_STATUS_CHANNEL, () => orchestrator.getStatus());

  return () => {
    ipcMain.removeHandler(CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL);
    ipcMain.removeHandler(CARD_IMAGE_BULK_DOWNLOAD_PAUSE_CHANNEL);
    ipcMain.removeHandler(CARD_IMAGE_BULK_DOWNLOAD_RESUME_CHANNEL);
    ipcMain.removeHandler(CARD_IMAGE_BULK_DOWNLOAD_ABORT_CHANNEL);
    ipcMain.removeHandler(CARD_IMAGE_BULK_DOWNLOAD_STATUS_CHANNEL);
  };
}
