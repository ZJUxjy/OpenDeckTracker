import { app, BrowserWindow, ipcMain } from 'electron';
import {
  DeckTracker,
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
 *   - `deck-tracker:get-snapshot`     — return current snapshot
 *   - `deck-tracker:select-deck`      — accept user's dialog choice and
 *                                        forward to `tracker.selectDeckById`
 *   - `deck-tracker:cancel-selection` — user dismissed the dialog
 *
 * The renderer dialog flow:
 *   1. tracker emits `needs-deck-selection` event with `decks` payload
 *   2. renderer shows DeckSelectDialog (driven by the Zustand
 *      `pendingSelection` slice populated from that event)
 *   3. user picks, renderer invokes `deck-tracker:select-deck` with deckId
 *   4. main calls `tracker.selectDeckById(deckId)` → tracker resolves
 *      the deck against its cached `getDecks()` list and sets
 *      `originalDeck` on the local player → next snapshot push includes
 *      the deck.
 *
 * The CallbackDeckIdentifier-based "blocking identifier" pattern
 * was rejected (it deadlocked: dialog couldn't show until the
 * identifier returned, identifier couldn't return until user picked
 * via the dialog).
 */

let tracker: DeckTracker | null = null;

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
  tracker = new DeckTracker({ mirror });

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

export function registerDeckTrackerIpc(): void {
  ipcMain.handle('deck-tracker:get-snapshot', (): DeckTrackerSnapshot | null => {
    return tracker?.getSnapshot() ?? null;
  });

  ipcMain.handle('deck-tracker:select-deck', async (_, deckId: number) => {
    if (tracker !== null) {
      await tracker.selectDeckById(deckId);
    }
  });

  ipcMain.handle('deck-tracker:cancel-selection', () => {
    tracker?.cancelDeckSelection();
  });
}
