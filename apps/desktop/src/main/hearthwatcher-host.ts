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
import { liveMatchIdentity } from './match-identity';
import { createPowerMatchRecorder } from './power-match-recorder';
import { recordCompletedMatch } from './stats-host';
import { gameProgressNarrationHost } from './game-progress-narration-host';

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
  const getMatchFingerprint = (): string | null =>
    liveMatchIdentity.current()?.fingerprint ?? null;
  const matchRecorder = createPowerMatchRecorder({
    getSnapshot: getLatestDeckTrackerSnapshot,
    getMatchFingerprint,
    record: recordCompletedMatch,
  });
  const recordingRecorder = createMatchRecordingRecorder({
    store: createDefaultMatchRecordingStore(app.getPath('userData')),
    getSnapshot: getLatestDeckTrackerSnapshot,
    getMatchFingerprint,
    onNarrationFrames: (frames) => gameProgressNarrationHost.appendFrames(frames),
  });
  const unsubscribeNarration = gameProgressNarrationHost.subscribe((frame) => {
    broadcast('game-progress-narration:frame', frame);
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
      if (event.type === 'create-game') {
        gameProgressNarrationHost.clear();
        liveMatchIdentity.beginLiveMatch(Date.now());
      }
      matchRecorder.handleEvent(event);
      recordingRecorder.handleEvent(event);
      if (isPowerGameComplete(event)) {
        liveMatchIdentity.clear();
      }
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
    unsubscribeNarration();
    watcher?.stop();
    watcher = null;
  });
}

function isPowerGameComplete(event: PowerEvent): boolean {
  return (
    event.type === 'tag-change' &&
    event.entity === 'GameEntity' &&
    ((event.tag === 'STATE' && event.value === 'COMPLETE') ||
      (event.tag === 'STEP' && event.value === 'FINAL_GAMEOVER'))
  );
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
