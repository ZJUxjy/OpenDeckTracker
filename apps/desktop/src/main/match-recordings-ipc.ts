import { app, ipcMain } from 'electron';
import type { MatchRecordingDetail, MatchRecordingSummary } from '@hdt/core';
import type { MatchRecordingStore } from './match-recording-store';
import { createDefaultMatchRecordingStore } from './match-recording-recorder';

export function registerMatchRecordingsIpc(options: { store?: Pick<MatchRecordingStore, 'listCompleted' | 'loadRecording'> } = {}): void {
  const store = options.store ?? createDefaultMatchRecordingStore(app.getPath('userData'));

  ipcMain.handle('recordings:list', (): MatchRecordingSummary[] => {
    return store.listCompleted();
  });

  ipcMain.handle('recordings:get', (_event, recordingId: string): MatchRecordingDetail | null => {
    return store.loadRecording(recordingId);
  });
}
