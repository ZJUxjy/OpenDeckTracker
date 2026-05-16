import { ipcMain } from 'electron';
import type { GameProgressNarrationFrame } from '@hdt/core';

export interface GameProgressNarrationHost {
  appendFrame(frame: GameProgressNarrationFrame): void;
  appendFrames(frames: readonly GameProgressNarrationFrame[]): void;
  getRecentFrames(): GameProgressNarrationFrame[];
  subscribe(listener: (frame: GameProgressNarrationFrame) => void): () => void;
  clear(): void;
}

export function createGameProgressNarrationHost(
  options: { maxFrames?: number } = {},
): GameProgressNarrationHost {
  const maxFrames = Math.max(1, options.maxFrames ?? 200);
  const recentFrames: GameProgressNarrationFrame[] = [];
  const listeners = new Set<(frame: GameProgressNarrationFrame) => void>();

  function appendFrame(frame: GameProgressNarrationFrame): void {
    recentFrames.push(frame);
    if (recentFrames.length > maxFrames) {
      recentFrames.splice(0, recentFrames.length - maxFrames);
    }
    for (const listener of listeners) {
      listener(frame);
    }
  }

  return {
    appendFrame,
    appendFrames(frames) {
      for (const frame of frames) appendFrame(frame);
    },
    getRecentFrames() {
      return [...recentFrames];
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear() {
      recentFrames.length = 0;
    },
  };
}

export const gameProgressNarrationHost = createGameProgressNarrationHost();

export function registerGameProgressNarrationIpc(
  host: Pick<GameProgressNarrationHost, 'getRecentFrames'> = gameProgressNarrationHost,
): void {
  ipcMain.handle('game-progress-narration:get-recent', (): GameProgressNarrationFrame[] =>
    host.getRecentFrames(),
  );
}
