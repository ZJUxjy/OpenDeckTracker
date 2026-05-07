import { app, BrowserWindow, ipcMain } from 'electron';
import {
  CardPlayedDetector,
  DeckTracker,
  type DeckTrackerEvent,
  type DeckTrackerSnapshot,
} from '@hdt/core';
import type { PowerEvent } from '@hdt/hearthwatcher';
import { getHearthMirror } from './hearthmirror';
import { recordCompletedMatch } from './stats-host';

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
let cardPlayedDetector: CardPlayedDetector | null = null;

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
  // Live detector that turns the upstream PowerEvent stream into
  // `card:played` calls on the tracker's global-effects registry.
  cardPlayedDetector = new CardPlayedDetector({
    emit: (event) => tracker?.recordCardPlayed(event),
  });

  let lastPhaseLogged: string | null = null;
  let lastDeckIdLogged: number | string | null = null;
  tracker.on('state-change', (event: DeckTrackerEvent) => {
    const s = event.snapshot;
    const phase = s?.phase ?? 'NULL';
    const deckId = s?.deck?.id ?? null;
    if (phase !== lastPhaseLogged || deckId !== lastDeckIdLogged) {
      console.log(
        `[deck-tracker] state phase=${phase} deck=${deckId === null ? 'null' : `${deckId} (${s?.deck?.name ?? '?'})`} remaining=${s?.deck?.remaining?.length ?? 0} oppRevealed=${s?.opponent?.revealed?.length ?? 0}`,
      );
      lastPhaseLogged = phase;
      lastDeckIdLogged = deckId;
    }
    fanoutPhase(phase);
    broadcast('deck-tracker:state', event.snapshot);
  });
  tracker.on('match-started', (event: DeckTrackerEvent) => {
    console.log(`[deck-tracker] match-started deck=${event.snapshot?.deck?.id ?? 'null'}`);
    broadcast('deck-tracker:event', { type: event.type, snapshot: event.snapshot });
  });
  tracker.on('match-ended', (event: DeckTrackerEvent) => {
    console.log(`[deck-tracker] match-ended completed=${event.completedMatch !== undefined}`);
    if (event.completedMatch !== undefined) {
      recordCompletedMatch(event.completedMatch);
    }
    broadcast('deck-tracker:event', {
      type: event.type,
      snapshot: event.snapshot,
      ...(event.completedMatch !== undefined ? { completedMatch: event.completedMatch } : {}),
    });
  });
  tracker.on('error', (event: DeckTrackerEvent) => {
    console.error('[deck-tracker] error:', event.error);
    broadcast('deck-tracker:event', {
      type: event.type,
      snapshot: event.snapshot,
      error: event.error,
    });
  });
  tracker.on('needs-deck-selection', (event: DeckTrackerEvent) => {
    console.log(`[deck-tracker] needs-deck-selection candidates=${event.decks?.length ?? 0}`);
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
    cardPlayedDetector = null;
  });
}

export function getLatestDeckTrackerSnapshot(): DeckTrackerSnapshot | null {
  return tracker?.getSnapshot() ?? null;
}

/**
 * Forward a HearthWatcher PowerEvent to the deck-tracker's
 * global-effects detector. Called from the watcher host alongside
 * the existing match-recorder + recording-recorder dispatches.
 */
export function forwardPowerEventToDeckTracker(event: PowerEvent): void {
  cardPlayedDetector?.handle(event);
}

/**
 * Subscribe to deck-tracker phase transitions. Used by the overlay
 * bootstrap to gate window visibility on whether the player is
 * actively in a match (PRE_MATCH or IN_MATCH) — we don't want the
 * overlay panels showing on the main menu / deck-picker.
 *
 * Returns an unsubscribe function. The callback fires once
 * immediately with the current phase if a tracker is already running.
 */
type PhaseListener = (phase: string) => void;
const phaseListeners = new Set<PhaseListener>();
let lastBroadcastPhase: string | null = null;

export function onDeckTrackerPhase(cb: PhaseListener): () => void {
  phaseListeners.add(cb);
  // Replay the most recent phase so a new subscriber lines up
  // with the rest of the system without waiting for the next tick.
  if (lastBroadcastPhase !== null) cb(lastBroadcastPhase);
  return () => {
    phaseListeners.delete(cb);
  };
}

function fanoutPhase(phase: string): void {
  if (phase === lastBroadcastPhase) return;
  lastBroadcastPhase = phase;
  for (const cb of phaseListeners) {
    try { cb(phase); } catch { /* keep loop healthy */ }
  }
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

  ipcMain.handle(
    'deck-tracker:select-saved-deck',
    (_, savedDeckId: string, savedDeckVersion: number) => {
      tracker?.selectSavedDeck(savedDeckId, savedDeckVersion);
    },
  );

  ipcMain.handle('deck-tracker:clear-saved-deck', () => {
    tracker?.clearSavedDeckAttribution();
  });
}
