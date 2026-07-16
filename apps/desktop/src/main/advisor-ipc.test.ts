import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain = {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
    invoke: (channel: string, event: unknown, ...args: unknown[]) =>
      Promise.resolve(handlers.get(channel)?.(event, ...args)),
  };
  const BrowserWindow = {
    getAllWindows: vi.fn(() => [] as unknown[]),
  };
  return { BrowserWindow, ipcMain };
});

import * as electron from 'electron';
import type { AdvisorConfig, AdvisorProvider } from '@hdt/advisor';
import type { AdvisorMainState } from './advisor';
import {
  ADVISOR_API_KEY_SET_CHANNEL,
  ADVISOR_ASK_CHANNEL,
  ADVISOR_ASK_CHUNK_CHANNEL,
  ADVISOR_CONFIG_GET_CHANNEL,
  ADVISOR_CONFIG_SET_CHANNEL,
  ADVISOR_STATE_CHANNEL,
  broadcastAdvisorState,
  registerAdvisorIpc,
} from './advisor-ipc';

const config: AdvisorConfig = {
  enabled: true,
  autoSuggest: true,
  provider: 'openai',
  model: 'gpt-test',
  language: 'zh',
};

let dispose: (() => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  dispose?.();
  dispose = null;
});

describe('advisor IPC', () => {
  it('registers ask and config handlers', () => {
    dispose = registerAdvisorIpc({
      ask: vi.fn(async () => 'answer'),
      getConfig: () => config,
      setConfig: (next) => next,
      setApiKey: () => 'ref:test',
    });

    expect(electron.ipcMain.handle).toHaveBeenCalledWith(ADVISOR_ASK_CHANNEL, expect.any(Function));
    expect(electron.ipcMain.handle).toHaveBeenCalledWith(
      ADVISOR_CONFIG_GET_CHANNEL,
      expect.any(Function),
    );
    expect(electron.ipcMain.handle).toHaveBeenCalledWith(
      ADVISOR_CONFIG_SET_CHANNEL,
      expect.any(Function),
    );
    expect(electron.ipcMain.handle).toHaveBeenCalledWith(
      ADVISOR_API_KEY_SET_CHANNEL,
      expect.any(Function),
    );
  });

  it('streams ask chunks to the requesting sender and returns the final answer', async () => {
    const sender = { send: vi.fn() };
    const ask = vi.fn(async (question: string, emitChunk: (chunk: string) => void) => {
      emitChunk('first ');
      emitChunk('second');
      return `answer: ${question}`;
    });
    dispose = registerAdvisorIpc({
      ask,
      getConfig: () => config,
      setConfig: (next) => next,
      setApiKey: () => 'ref:test',
    });

    const result = await (electron.ipcMain as unknown as {
      invoke: (channel: string, event: unknown, question: string) => Promise<string>;
    }).invoke(ADVISOR_ASK_CHANNEL, { sender }, ' why trade? ');

    expect(ask).toHaveBeenCalledWith('why trade?', expect.any(Function));
    expect(sender.send).toHaveBeenCalledWith(ADVISOR_ASK_CHUNK_CHANNEL, 'first ');
    expect(sender.send).toHaveBeenCalledWith(ADVISOR_ASK_CHUNK_CHANNEL, 'second');
    expect(result).toBe('answer: why trade?');
  });

  it('returns and updates advisor config through IPC handlers', async () => {
    const setConfig = vi.fn((next: AdvisorConfig) => ({ ...next, model: `${next.model}-saved` }));
    dispose = registerAdvisorIpc({
      ask: vi.fn(async () => 'answer'),
      getConfig: () => config,
      setConfig,
      setApiKey: () => 'ref:test',
    });
    const ipc = electron.ipcMain as unknown as {
      invoke: (channel: string, event: unknown, config?: AdvisorConfig) => Promise<AdvisorConfig>;
    };
    const next: AdvisorConfig = { ...config, model: 'gpt-next' };

    await expect(ipc.invoke(ADVISOR_CONFIG_GET_CHANNEL, {})).resolves.toEqual(config);
    await expect(ipc.invoke(ADVISOR_CONFIG_SET_CHANNEL, {}, next)).resolves.toEqual({
      ...next,
      model: 'gpt-next-saved',
    });
    expect(setConfig).toHaveBeenCalledWith(next);
  });

  it('sets API key through IPC handler and returns the ref', async () => {
    const setApiKey = vi.fn((provider: AdvisorProvider, _apiKey: string) => `ref:${provider}`);
    dispose = registerAdvisorIpc({
      ask: vi.fn(async () => 'answer'),
      getConfig: () => config,
      setConfig: (next) => next,
      setApiKey,
    });
    const ipc = electron.ipcMain as unknown as {
      invoke: (channel: string, event: unknown, provider?: AdvisorProvider, apiKey?: string) => Promise<string>;
    };

    await expect(ipc.invoke(ADVISOR_API_KEY_SET_CHANNEL, {}, 'anthropic', 'sk-ant-test')).resolves.toBe(
      'ref:anthropic',
    );
    expect(setApiKey).toHaveBeenCalledWith('anthropic', 'sk-ant-test');
  });

  it('broadcasts advisor state to every live window', () => {
    const send = vi.fn();
    vi.mocked(electron.BrowserWindow.getAllWindows).mockReturnValue([
      { isDestroyed: () => false, webContents: { send } },
      { isDestroyed: () => true, webContents: { send: vi.fn() } },
    ] as never);
    const state: AdvisorMainState = {
      status: 'ready',
      suggestion: null,
      alerts: [],
      error: null,
      updatedAt: 1,
    };

    broadcastAdvisorState(state);

    expect(send).toHaveBeenCalledWith(ADVISOR_STATE_CHANNEL, state);
  });
});
