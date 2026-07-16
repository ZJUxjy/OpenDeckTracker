import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { AdvisorConfig, AdvisorProvider } from '@hdt/advisor';
import type { AdvisorMainState } from './advisor';
import {
  ADVISOR_API_KEY_SET_CHANNEL,
  ADVISOR_ASK_CHANNEL,
  ADVISOR_ASK_CHUNK_CHANNEL,
  ADVISOR_CONFIG_GET_CHANNEL,
  ADVISOR_CONFIG_SET_CHANNEL,
  ADVISOR_STATE_CHANNEL,
} from '../shared/ipc-channels';
export { DEFAULT_ADVISOR_CONFIG } from './advisor-config-store';
export {
  ADVISOR_API_KEY_SET_CHANNEL,
  ADVISOR_ASK_CHANNEL,
  ADVISOR_ASK_CHUNK_CHANNEL,
  ADVISOR_CONFIG_GET_CHANNEL,
  ADVISOR_CONFIG_SET_CHANNEL,
  ADVISOR_STATE_CHANNEL,
};

export interface AdvisorIpcDeps {
  ask: (question: string, emitChunk: (chunk: string) => void) => Promise<string> | string;
  getConfig: () => AdvisorConfig;
  setConfig: (config: AdvisorConfig) => Promise<AdvisorConfig> | AdvisorConfig;
  setApiKey: (provider: AdvisorProvider, apiKey: string) => string;
}

export function broadcastAdvisorState(
  state: AdvisorMainState,
  getWindows: () => Pick<BrowserWindow, 'webContents' | 'isDestroyed'>[] = () =>
    BrowserWindow.getAllWindows(),
): void {
  for (const win of getWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(ADVISOR_STATE_CHANNEL, state);
    }
  }
}

function normalizeQuestion(question: unknown): string {
  if (typeof question !== 'string') {
    throw new Error('Advisor question must be a string');
  }
  const trimmed = question.trim();
  if (trimmed.length === 0) {
    throw new Error('Advisor question cannot be empty');
  }
  return trimmed;
}

export function registerAdvisorIpc(deps: AdvisorIpcDeps): () => void {
  ipcMain.handle(
    ADVISOR_ASK_CHANNEL,
    async (event: IpcMainInvokeEvent, question: unknown): Promise<string> => {
      const normalized = normalizeQuestion(question);
      return deps.ask(normalized, (chunk) => {
        event.sender.send(ADVISOR_ASK_CHUNK_CHANNEL, chunk);
      });
    },
  );

  ipcMain.handle(ADVISOR_CONFIG_GET_CHANNEL, (): AdvisorConfig => deps.getConfig());

  ipcMain.handle(
    ADVISOR_CONFIG_SET_CHANNEL,
    (_event, config: AdvisorConfig): Promise<AdvisorConfig> | AdvisorConfig =>
      deps.setConfig(config),
  );

  ipcMain.handle(
    ADVISOR_API_KEY_SET_CHANNEL,
    (_event, provider: AdvisorProvider, apiKey: string): string =>
      deps.setApiKey(provider, apiKey),
  );

  return () => {
    ipcMain.removeHandler(ADVISOR_ASK_CHANNEL);
    ipcMain.removeHandler(ADVISOR_CONFIG_GET_CHANNEL);
    ipcMain.removeHandler(ADVISOR_CONFIG_SET_CHANNEL);
    ipcMain.removeHandler(ADVISOR_API_KEY_SET_CHANNEL);
  };
}
