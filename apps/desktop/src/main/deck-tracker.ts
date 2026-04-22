import { app, BrowserWindow, ipcMain } from 'electron';
import {
  CallbackDeckIdentifier,
  ChainedDeckIdentifier,
  DeckTracker,
  InGameDeckIdentifier,
  type DeckTrackerEvent,
  type DeckTrackerSnapshot,
} from '@hdt/core';
import { getHearthMirror } from './hearthmirror';

/**
 * Per-app session DeckTracker host.
 *
 * Owns one `DeckTracker` instance, forwards its events to all
 * BrowserWindows over IPC channels:
 *   - `deck-tracker:state`  — full snapshot push (every tick)
 *   - `deck-tracker:event`  — typed event push (match-started, etc.)
 *
 * Renderer-driven IPC handlers:
 *   - `deck-tracker:get-snapshot`   — return current snapshot
 *   - `deck-tracker:select-deck`    — accept user's dialog choice and
 *                                     forward into the orchestrator
 *
 * The renderer dialog flow:
 *   1. main emits `event` { type: 'needs-deck-selection', decks }
 *   2. renderer shows DeckSelectDialog with the listed decks
 *   3. user picks, renderer invokes `deck-tracker:select-deck` with deckId
 *   4. main resolves the pending CallbackDeckIdentifier promise
 */

let tracker: DeckTracker | null = null;
let pendingSelection: ((deckId: number | null) => void) | null = null;

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

export function startDeckTracker(): void {
  if (tracker !== null) return;
  const mirror = getHearthMirror();
  const callbackIdentifier = new CallbackDeckIdentifier(
    (decks) =>
      new Promise<number | null>((resolve) => {
        pendingSelection = resolve;
        // The DeckTracker emits `needs-deck-selection` separately on
        // its own — we just store the resolver so the IPC handler can
        // call it when the user picks.
        // Safety timeout: if no selection within 60s, give up so the
        // tracker doesn't leak the resolver forever.
        setTimeout(() => {
          if (pendingSelection === resolve) {
            pendingSelection = null;
            resolve(null);
          }
        }, 60_000);
        // Reference unused arg so TS doesn't complain.
        void decks;
      }),
  );
  tracker = new DeckTracker({
    mirror,
    identifier: new ChainedDeckIdentifier([new InGameDeckIdentifier(), callbackIdentifier]),
  });

  tracker.on('state-change', (event: DeckTrackerEvent) => {
    broadcast('deck-tracker:state', event.snapshot);
  });
  tracker.on('match-started', (event: DeckTrackerEvent) => {
    broadcast('deck-tracker:event', { type: event.type, snapshot: event.snapshot });
  });
  tracker.on('match-ended', (event: DeckTrackerEvent) => {
    broadcast('deck-tracker:event', { type: event.type, snapshot: event.snapshot });
  });
  tracker.on('error', (event: DeckTrackerEvent) => {
    broadcast('deck-tracker:event', {
      type: event.type,
      snapshot: event.snapshot,
      error: event.error,
    });
  });
  tracker.on('needs-deck-selection', (event: DeckTrackerEvent) => {
    broadcast('deck-tracker:event', {
      type: event.type,
      snapshot: event.snapshot,
      decks: event.decks,
    });
  });

  tracker.start();

  app.on('before-quit', () => {
    tracker?.stop();
    tracker = null;
  });
}

/**
 * Wire IPC handlers for renderer-initiated calls. Called from
 * `registerIpc()` so it shares the same registration lifecycle.
 */
export function registerDeckTrackerIpc(): void {
  ipcMain.handle('deck-tracker:get-snapshot', (): DeckTrackerSnapshot | null => {
    return tracker?.getSnapshot() ?? null;
  });

  ipcMain.handle('deck-tracker:select-deck', (_, deckId: number) => {
    if (pendingSelection !== null) {
      const resolve = pendingSelection;
      pendingSelection = null;
      resolve(deckId);
    }
  });

  ipcMain.handle('deck-tracker:cancel-selection', () => {
    if (pendingSelection !== null) {
      const resolve = pendingSelection;
      pendingSelection = null;
      resolve(null);
    }
  });
}
