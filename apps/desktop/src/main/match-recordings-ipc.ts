import { app, ipcMain } from 'electron';
import type { MatchRecordingDetail, MatchRecordingSummary, RecordingAnnotation } from '@hdt/core';
import { computeMulliganStats, type MulliganFilter, type MatchHistoryRecord, type MatchRecording } from '@hdt/core';
import { getMatchHistoryStore } from './stats-host';
import type { MatchRecordingStore } from './match-recording-store';
import { createDefaultMatchRecordingStore } from './match-recording-recorder';

export function registerMatchRecordingsIpc(options: { store?: Pick<MatchRecordingStore, 'listCompleted' | 'loadRecording'> & Partial<Pick<MatchRecordingStore, 'saveAnnotation'>>; getMatches?: () => MatchHistoryRecord[] } = {}): void {
  const store = options.store ?? createDefaultMatchRecordingStore(app.getPath('userData'));
  ipcMain.handle('recordings:save-annotation', (_event, recordingId: string, annotation: RecordingAnnotation) => {
    if (!store.saveAnnotation) throw new Error('Recording annotations unavailable');
    return store.saveAnnotation(recordingId, annotation);
  });
  ipcMain.handle('recordings:mulligan-stats', (_event, filter: MulliganFilter = {}) => {
    const recordings: MatchRecording[] = store.listCompleted().flatMap(summary => {
      const recording = store.loadRecording(summary.recordingId, { includeRawEvents: false });
      return recording ? [recording] : [];
    });
    const matches = options.getMatches?.() ?? getMatchHistoryStore().getAllForFilter({ filter: 'all-time' });
    return computeMulliganStats(recordings, matches, filter);
  });

  ipcMain.handle('recordings:list', (): MatchRecordingSummary[] => {
    return store.listCompleted();
  });

  ipcMain.handle('recordings:get', (_event, recordingId: string): MatchRecordingDetail | null => {
    return store.loadRecording(recordingId);
  });
}
