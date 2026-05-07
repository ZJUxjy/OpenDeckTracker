import { app, BrowserWindow, ipcMain } from 'electron';
import {
  createHearthWatcher,
  type EventPhase,
  type HearthWatcherDiagnostic,
  type PowerEvent,
} from '@hdt/hearthwatcher';
import {
  forwardPowerEventToDeckTracker,
  getLatestDeckTrackerSnapshot,
} from './deck-tracker';
import {
  createDefaultMatchRecordingStore,
  createMatchRecordingRecorder,
} from './match-recording-recorder';
import { createPowerMatchRecorder } from './power-match-recorder';
import { recordCompletedMatch } from './stats-host';

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
  const matchRecorder = createPowerMatchRecorder({
    getSnapshot: getLatestDeckTrackerSnapshot,
    record: recordCompletedMatch,
  });
  const recordingRecorder = createMatchRecordingRecorder({
    store: createDefaultMatchRecordingStore(app.getPath('userData')),
    getSnapshot: getLatestDeckTrackerSnapshot,
  });
  watcher.onStatus((status) => {
    logHearthWatcherStatus(status);
    latestStatus = status;
    broadcast('hearthwatcher:status', status);
  });
  watcher.onEvent((event: PowerEvent, phase: EventPhase) => {
    // Replay events come from a one-shot read of the file at startup
    // when Hearthstone was already mid-match. They feed downstream
    // state (global-effects detector, board-attack tag overlay) so
    // the snapshot reflects what's actually in play, but they MUST
    // NOT trigger recorders that write durable artifacts — that
    // would double-record the match every time the tracker restarts.
    if (phase === 'live') {
      matchRecorder.handleEvent(event);
      recordingRecorder.handleEvent(event);
    }
    forwardPowerEventToDeckTracker(event, phase);
    if (phase === 'live') {
      broadcast('hearthwatcher:event', event);
    }
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

function logHearthWatcherStatus(status: HearthWatcherDiagnostic): void {
  const details = {
    kind: status.kind,
    message: status.message,
    path: status.path,
    recordType: status.recordType,
    line: status.line,
    searchedPathCount: status.searchedPaths?.length,
    searchedPaths: status.searchedPaths,
    droppedLines: status.droppedLines,
    timestamp: new Date(status.timestamp).toISOString(),
  };

  if (status.kind === 'missing-log' || status.kind === 'parser-error') {
    console.warn('[hearthwatcher] status', details);
    return;
  }

  console.info('[hearthwatcher] status', details);
}

export function registerHearthWatcherIpc(): void {
  ipcMain.handle('hearthwatcher:get-status', (): HearthWatcherDiagnostic | null => {
    return latestStatus;
  });
}
