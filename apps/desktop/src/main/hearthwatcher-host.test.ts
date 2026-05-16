import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventPhase, HearthWatcherDiagnostic, PowerEvent } from '@hdt/hearthwatcher';

const mocks = vi.hoisted(() => {
  const statusHandlers: ((status: HearthWatcherDiagnostic) => void)[] = [];
  const eventHandlers: ((event: unknown, phase: EventPhase) => void)[] = [];
  const narrationHandlers: ((frame: unknown) => void)[] = [];
  const watcher = {
    onStatus: vi.fn((handler: (status: HearthWatcherDiagnostic) => void) => {
      statusHandlers.push(handler);
      return () => undefined;
    }),
    onEvent: vi.fn((handler: (event: unknown, phase: EventPhase) => void) => {
      eventHandlers.push(handler);
      return () => undefined;
    }),
    start: vi.fn(async () => undefined),
    stop: vi.fn(),
  };
  const powerRecorder = { handleEvent: vi.fn() };
  const matchRecordingRecorder = { handleEvent: vi.fn() };
  return {
    statusHandlers,
    eventHandlers,
    watcher,
    createHearthWatcher: vi.fn(() => watcher),
    createPowerMatchRecorder: vi.fn(() => powerRecorder),
    createDefaultMatchRecordingStore: vi.fn(() => ({ kind: 'store' })),
    createMatchRecordingRecorder: vi.fn(() => matchRecordingRecorder),
    getLatestDeckTrackerSnapshot: vi.fn(() => null),
    recordCompletedMatch: vi.fn(),
    liveMatchIdentity: {
      beginLiveMatch: vi.fn(),
      current: vi.fn((): { fingerprint: string; startedAt: number } | null => null),
      clear: vi.fn(),
    },
    gameProgressNarrationHost: {
      appendFrames: vi.fn(),
      clear: vi.fn(),
      subscribe: vi.fn((handler: (frame: unknown) => void) => {
        narrationHandlers.push(handler);
        return vi.fn();
      }),
    },
    powerRecorder,
    matchRecordingRecorder,
    ipcMain: { handle: vi.fn() },
    app: { on: vi.fn(), getPath: vi.fn(() => 'C:\\Users\\me\\AppData\\Roaming\\HDT') },
    send: vi.fn(),
    narrationHandlers,
  };
});

vi.mock('@hdt/hearthwatcher', () => ({
  createHearthWatcher: mocks.createHearthWatcher,
}));

vi.mock('./power-match-recorder', () => ({
  createPowerMatchRecorder: mocks.createPowerMatchRecorder,
}));

vi.mock('./match-recording-recorder', () => ({
  createDefaultMatchRecordingStore: mocks.createDefaultMatchRecordingStore,
  createMatchRecordingRecorder: mocks.createMatchRecordingRecorder,
}));

vi.mock('./deck-tracker', () => ({
  getLatestDeckTrackerSnapshot: mocks.getLatestDeckTrackerSnapshot,
  forwardPowerEventToDeckTracker: vi.fn(),
}));

vi.mock('./stats-host', () => ({
  recordCompletedMatch: mocks.recordCompletedMatch,
}));

vi.mock('./match-identity', () => ({
  liveMatchIdentity: mocks.liveMatchIdentity,
}));

vi.mock('./game-progress-narration-host', () => ({
  gameProgressNarrationHost: mocks.gameProgressNarrationHost,
}));

vi.mock('electron', () => ({
  app: mocks.app,
  ipcMain: mocks.ipcMain,
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: { send: mocks.send },
      },
    ],
  },
}));

describe('hearthwatcher-host', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.statusHandlers.length = 0;
    mocks.eventHandlers.length = 0;
    mocks.narrationHandlers.length = 0;
    mocks.liveMatchIdentity.current.mockReturnValue(null);
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts HearthWatcher and broadcasts status updates', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { startHearthWatcher } = await import('./hearthwatcher-host');
    startHearthWatcher();

    expect(mocks.createHearthWatcher).toHaveBeenCalledTimes(1);
    expect(mocks.watcher.start).toHaveBeenCalledTimes(1);

    const status: HearthWatcherDiagnostic = {
      kind: 'ready',
      message: 'ready',
      timestamp: 1,
    };
    mocks.statusHandlers[0]?.(status);
    expect(mocks.send).toHaveBeenCalledWith('hearthwatcher:status', status);
    expect(info).toHaveBeenCalledWith(
      '[hearthwatcher] status',
      expect.objectContaining({ kind: 'ready', message: 'ready' }),
    );
  });

  it('logs parser-error diagnostics with line context', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { startHearthWatcher } = await import('./hearthwatcher-host');
    startHearthWatcher();

    const status: HearthWatcherDiagnostic = {
      kind: 'parser-error',
      message: 'Malformed Power.log record',
      path: 'E:\\battle\\Hearthstone\\Logs\\Hearthstone_2026_04_27_15_34_09\\Power.log',
      recordType: 'TAG_CHANGE',
      line: 'TAG_CHANGE bad',
      timestamp: 1,
    };
    mocks.statusHandlers[0]?.(status);

    expect(warn).toHaveBeenCalledWith(
      '[hearthwatcher] status',
      expect.objectContaining({
        kind: 'parser-error',
        path: status.path,
        recordType: 'TAG_CHANGE',
        line: 'TAG_CHANGE bad',
      }),
    );
  });

  it('routes live Power.log events through the match recorder before broadcasting', async () => {
    const { startHearthWatcher } = await import('./hearthwatcher-host');
    startHearthWatcher();

    const event: PowerEvent = { type: 'create-game', raw: '', content: '' };
    mocks.eventHandlers[0]?.(event, 'live');

    expect(mocks.createPowerMatchRecorder).toHaveBeenCalledWith({
      getSnapshot: mocks.getLatestDeckTrackerSnapshot,
      getMatchFingerprint: expect.any(Function),
      record: mocks.recordCompletedMatch,
    });
    expect(mocks.createDefaultMatchRecordingStore).toHaveBeenCalledWith(
      'C:\\Users\\me\\AppData\\Roaming\\HDT',
    );
    expect(mocks.createMatchRecordingRecorder).toHaveBeenCalledWith({
      store: { kind: 'store' },
      getSnapshot: mocks.getLatestDeckTrackerSnapshot,
      getMatchFingerprint: expect.any(Function),
      onNarrationFrames: expect.any(Function),
    });
    expect(mocks.powerRecorder.handleEvent).toHaveBeenCalledWith(event);
    expect(mocks.matchRecordingRecorder.handleEvent).toHaveBeenCalledWith(event);
    expect(mocks.send).toHaveBeenCalledWith('hearthwatcher:event', event);
  });

  it('broadcasts live narration frames emitted by the narration host', async () => {
    const { startHearthWatcher } = await import('./hearthwatcher-host');
    startHearthWatcher();

    const frame = {
      sequence: 0,
      sourceEventIndex: 0,
      eventKind: 'game-started',
      text: '对局开始。',
      facts: {},
    };
    mocks.narrationHandlers[0]?.(frame);

    expect(mocks.send).toHaveBeenCalledWith('game-progress-narration:frame', frame);
  });

  it('clears live narration before live recorders handle create-game', async () => {
    const { startHearthWatcher } = await import('./hearthwatcher-host');
    startHearthWatcher();

    const event: PowerEvent = { type: 'create-game', raw: '', content: '' };
    mocks.eventHandlers[0]?.(event, 'live');

    expect(mocks.gameProgressNarrationHost.clear).toHaveBeenCalledTimes(1);
    expect(
      mocks.gameProgressNarrationHost.clear.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.matchRecordingRecorder.handleEvent.mock.invocationCallOrder[0]!);
  });

  it('passes live match fingerprint callbacks to durable recorders', async () => {
    const { startHearthWatcher } = await import('./hearthwatcher-host');
    startHearthWatcher();

    const powerCalls = mocks.createPowerMatchRecorder.mock.calls as unknown as Array<[{
      getMatchFingerprint: () => string | null;
    }]>;
    const recordingCalls = mocks.createMatchRecordingRecorder.mock.calls as unknown as Array<[{
      getMatchFingerprint: () => string | null;
    }]>;
    const powerArgs = powerCalls[0]![0];
    const recordingArgs = recordingCalls[0]![0];

    mocks.liveMatchIdentity.current.mockReturnValue({
      fingerprint: 'match-v2-1000-1',
      startedAt: 1_000,
    });
    expect(powerArgs.getMatchFingerprint()).toBe('match-v2-1000-1');
    expect(recordingArgs.getMatchFingerprint()).toBe('match-v2-1000-1');

    mocks.liveMatchIdentity.current.mockReturnValue(null);
    expect(powerArgs.getMatchFingerprint()).toBeNull();
    expect(recordingArgs.getMatchFingerprint()).toBeNull();
  });

  it('starts live match identity before live recorders handle create-game', async () => {
    const { startHearthWatcher } = await import('./hearthwatcher-host');
    startHearthWatcher();

    const event: PowerEvent = { type: 'create-game', raw: '', content: '' };
    mocks.eventHandlers[0]?.(event, 'live');

    expect(mocks.liveMatchIdentity.beginLiveMatch).toHaveBeenCalledWith(expect.any(Number));
    expect(
      mocks.liveMatchIdentity.beginLiveMatch.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.powerRecorder.handleEvent.mock.invocationCallOrder[0]!);
    expect(
      mocks.liveMatchIdentity.beginLiveMatch.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.matchRecordingRecorder.handleEvent.mock.invocationCallOrder[0]!);
  });

  it('clears live match identity after live recorders handle game completion', async () => {
    const { startHearthWatcher } = await import('./hearthwatcher-host');
    startHearthWatcher();

    const event: PowerEvent = {
      type: 'tag-change',
      entity: 'GameEntity',
      tag: 'STATE',
      value: 'COMPLETE',
      raw: '',
      content: '',
    };
    mocks.eventHandlers[0]?.(event, 'live');

    expect(mocks.liveMatchIdentity.clear).toHaveBeenCalledTimes(1);
    expect(
      mocks.powerRecorder.handleEvent.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.liveMatchIdentity.clear.mock.invocationCallOrder[0]!);
    expect(
      mocks.matchRecordingRecorder.handleEvent.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.liveMatchIdentity.clear.mock.invocationCallOrder[0]!);
  });

  it('skips recorders and broadcast for replay events', async () => {
    const { startHearthWatcher } = await import('./hearthwatcher-host');
    startHearthWatcher();

    const event: PowerEvent = { type: 'create-game', raw: '', content: '' };
    mocks.eventHandlers[0]?.(event, 'replay');

    // Replay must not trigger durable-write recorders or push to the
    // renderer event channel (renderers see resulting state via the
    // separate `deck-tracker:state` snapshot push instead).
    expect(mocks.powerRecorder.handleEvent).not.toHaveBeenCalled();
    expect(mocks.matchRecordingRecorder.handleEvent).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalledWith('hearthwatcher:event', event);
  });

  it('registers IPC handler for latest status', async () => {
    const { registerHearthWatcherIpc } = await import('./hearthwatcher-host');
    registerHearthWatcherIpc();

    expect(mocks.ipcMain.handle).toHaveBeenCalledWith(
      'hearthwatcher:get-status',
      expect.any(Function),
    );
  });
});
