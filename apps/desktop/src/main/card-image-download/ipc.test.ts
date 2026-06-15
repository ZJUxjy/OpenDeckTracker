import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const sent: Array<{ channel: string; args: unknown[] }> = [];
  const ipcMain = {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
    invoke: (channel: string, ...args: unknown[]) => {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`No handler for ${channel}`);
      return fn({}, ...args);
    },
  };
  const BrowserWindow = {
    getAllWindows: () => windows,
    __sent: sent,
  };
  const windows: Array<{ isDestroyed: () => boolean; webContents: { send: (c: string, ...a: unknown[]) => void } }> = [
    {
      isDestroyed: () => false,
      webContents: {
        send: (channel: string, ...args: unknown[]) => {
          sent.push({ channel, args });
        },
      },
    },
  ];
  return { ipcMain, BrowserWindow };
});

import * as electron from 'electron';
import {
  CARD_IMAGE_BULK_DOWNLOAD_ABORT_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_PAUSE_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_PROGRESS_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_RESUME_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL,
  CARD_IMAGE_BULK_DOWNLOAD_STATUS_CHANNEL,
  registerCardImageBulkDownloadIpc,
} from './ipc';
import type { CardImageBulkDownloadOrchestrator } from './orchestrator';

interface MockOrchestrator {
  start: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  getStatus: ReturnType<typeof vi.fn>;
}

describe('registerCardImageBulkDownloadIpc', () => {
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    (electron.BrowserWindow as unknown as { __sent: Array<unknown> }).__sent.length = 0;
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
  });

  it('registers handlers for the documented channels', () => {
    const orch: MockOrchestrator = {
      start: vi.fn(async () => ({ ok: true, status: { state: 'running' } })),
      pause: vi.fn(),
      resume: vi.fn(async () => ({ ok: true, status: { state: 'running' } })),
      abort: vi.fn(),
      getStatus: vi.fn(() => ({ state: 'idle' })),
    };

    dispose = registerCardImageBulkDownloadIpc(orch as unknown as CardImageBulkDownloadOrchestrator);
    const handleSpy = vi.mocked(electron.ipcMain.handle);
    const channels = handleSpy.mock.calls.map((c) => c[0] as string);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_PAUSE_CHANNEL);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_RESUME_CHANNEL);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_ABORT_CHANNEL);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_STATUS_CHANNEL);
  });

  it('invoking start delegates to orchestrator.start', async () => {
    const orch: MockOrchestrator = {
      start: vi.fn(async () => ({ ok: true, status: { state: 'running' } })),
      pause: vi.fn(),
      resume: vi.fn(),
      abort: vi.fn(),
      getStatus: vi.fn(),
    };
    dispose = registerCardImageBulkDownloadIpc(orch as unknown as CardImageBulkDownloadOrchestrator);
    const ipcMain = electron.ipcMain as unknown as { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> };

    const result = await ipcMain.invoke(CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL, ['render'], true);
    expect(result).toEqual({ ok: true, status: { state: 'running' } });
    expect(orch.start).toHaveBeenCalledWith(['render'], expect.any(Function), true);
  });

  it('broadcasts progress to renderer windows', async () => {
    const orch: MockOrchestrator = {
      start: vi.fn(async (_types, cb) => {
        cb({ state: 'running' });
        return { ok: true, status: { state: 'completed' } };
      }),
      pause: vi.fn(),
      resume: vi.fn(),
      abort: vi.fn(),
      getStatus: vi.fn(),
    };

    dispose = registerCardImageBulkDownloadIpc(orch as unknown as CardImageBulkDownloadOrchestrator);
    const ipcMain = electron.ipcMain as unknown as { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> };
    await ipcMain.invoke(CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL, [['render']]);

    const sent = (electron.BrowserWindow as unknown as { __sent: Array<{ channel: string; args: unknown[] }> }).__sent;
    expect(sent.some((s) => s.channel === CARD_IMAGE_BULK_DOWNLOAD_PROGRESS_CHANNEL)).toBe(true);
  });

  it('dispose removes all handlers', () => {
    const orch: MockOrchestrator = {
      start: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      abort: vi.fn(),
      getStatus: vi.fn(),
    };
    const local = registerCardImageBulkDownloadIpc(orch as unknown as CardImageBulkDownloadOrchestrator);
    local();
    const removeSpy = vi.mocked(electron.ipcMain.removeHandler);
    const channels = removeSpy.mock.calls.map((c) => c[0]);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_PAUSE_CHANNEL);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_RESUME_CHANNEL);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_ABORT_CHANNEL);
    expect(channels).toContain(CARD_IMAGE_BULK_DOWNLOAD_STATUS_CHANNEL);
  });
});
