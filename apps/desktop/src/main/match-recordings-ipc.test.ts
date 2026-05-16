import { describe, expect, it, vi } from 'vitest';
import type { MatchRecordingDetail, MatchRecordingSummary } from '@hdt/core';
import { registerMatchRecordingsIpc } from './match-recordings-ipc';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('electron', () => ({
  ipcMain: mocks.ipcMain,
  app: {
    getPath: () => 'C:\\Users\\me\\AppData\\Roaming\\HDT',
  },
}));

describe('match-recordings-ipc', () => {
  it('registers read-only list and detail handlers', async () => {
    const summaries: MatchRecordingSummary[] = [{
      recordingId: 'rec-a',
      status: 'completed',
      startedAt: 1,
      endedAt: 2,
      deckId: 42,
      deckName: 'Tempo Mage',
      opponentName: 'Opponent',
      result: 'win',
      timelineEventCount: 3,
      analysisEventCount: 0,
      narrationFrameCount: 0,
    }];
    const detail = { recordingId: 'rec-a', rawEvents: [] } as unknown as MatchRecordingDetail;
    const store = {
      listCompleted: vi.fn(() => summaries),
      loadRecording: vi.fn((id: string) => (id === 'rec-a' ? detail : null)),
    };

    registerMatchRecordingsIpc({ store });

    expect(mocks.ipcMain.handle).toHaveBeenCalledWith('recordings:list', expect.any(Function));
    expect(mocks.ipcMain.handle).toHaveBeenCalledWith('recordings:get', expect.any(Function));
    expect(mocks.handlers.get('recordings:list')?.()).toEqual(summaries);
    expect(mocks.handlers.get('recordings:get')?.({}, 'rec-a')).toBe(detail);
    expect(mocks.handlers.get('recordings:get')?.({}, 'missing')).toBeNull();
  });

  it('recordings:get accepts match fingerprint', () => {
    const detail = { recordingId: 'rec-a', rawEvents: [] } as unknown as MatchRecordingDetail;
    const store = {
      listCompleted: vi.fn(() => []),
      loadRecording: vi.fn(() => detail),
    };

    registerMatchRecordingsIpc({ store });

    expect(mocks.handlers.get('recordings:get')?.({}, 'match-v2-1000-1')).toBe(detail);
    expect(store.loadRecording).toHaveBeenCalledWith('match-v2-1000-1');
  });
});
