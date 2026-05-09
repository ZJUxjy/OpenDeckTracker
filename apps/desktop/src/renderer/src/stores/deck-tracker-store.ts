import { create } from 'zustand';
import type {
  ActiveEffect,
  DeckTrackerEvent,
  DeckTrackerSnapshot,
  OpponentCardRecord,
} from '@hdt/core';

const EMPTY_EFFECTS: readonly ActiveEffect[] = Object.freeze([]);

export interface PendingDeckSelection {
  decks: { id: number; name: string; hero: string }[];
}

interface DeckTrackerStoreState {
  snapshot: DeckTrackerSnapshot | null;
  pendingSelection: PendingDeckSelection | null;
  /**
   * When the user has dismissed (cancelled or confirmed) the dialog,
   * we set this true to suppress the dialog from re-opening on subsequent
   * snapshot ticks until the tracker actually clears
   * `pendingDeckSelection` (after `setOriginalDeck` or
   * `cancelDeckSelection` runs in main).
   */
  dialogDismissed: boolean;
  setSnapshot: (snapshot: DeckTrackerSnapshot) => void;
  applyEvent: (event: DeckTrackerEvent) => void;
  clearPendingSelection: () => void;
  markDialogDismissed: () => void;
}

/**
 * Renderer-side mirror of the main-process DeckTracker.
 *
 * `pendingSelection` is derived primarily from
 * `snapshot.pendingDeckSelection` (every-tick push from main —
 * race-free against renderer startup), with the one-shot
 * `needs-deck-selection` event as a low-latency supplement.
 *
 * `dialogDismissed` exists because the snapshot keeps reporting
 * `pendingDeckSelection` non-null until the orchestrator clears
 * `awaitingDeckSelection` (via `setOriginalDeck` or
 * `cancelDeckSelection`). Without this guard, dismissing the dialog
 * would cause it to immediately re-open on the next tick.
 */
export const useDeckTrackerStore = create<DeckTrackerStoreState>((set, get) => ({
  snapshot: null,
  pendingSelection: null,
  dialogDismissed: false,
  setSnapshot: (snapshot) => {
    const dismissed = get().dialogDismissed;
    const pendingFromSnapshot = snapshot.pendingDeckSelection;
    set({
      snapshot,
      pendingSelection: dismissed ? null : (pendingFromSnapshot ?? null),
      // Reset dismissal flag when main has cleared its pending state
      // (so the next match's dialog can show).
      dialogDismissed: pendingFromSnapshot === null ? false : dismissed,
    });
  },
  applyEvent: (event) => {
    if (event.type === 'needs-deck-selection') {
      set({
        pendingSelection: { decks: event.decks ?? [] },
        dialogDismissed: false,
      });
    } else if (event.type === 'match-ended') {
      set({ pendingSelection: null, dialogDismissed: false });
    }
  },
  clearPendingSelection: () => set({ pendingSelection: null }),
  markDialogDismissed: () => set({ pendingSelection: null, dialogDismissed: true }),
}));

/**
 * Returns the local player's active global effects, or an empty
 * frozen array when the snapshot is missing or hasn't been migrated
 * with the new fields. The frozen array is shared across calls so
 * downstream React diffs short-circuit on `Object.is`.
 */
export function useFriendlyEffects(): readonly ActiveEffect[] {
  return useDeckTrackerStore(
    (s) => s.snapshot?.friendlyEffects ?? EMPTY_EFFECTS,
  );
}

/** Same shape as `useFriendlyEffects` for the opposing player. */
export function useOpposingEffects(): readonly ActiveEffect[] {
  return useDeckTrackerStore(
    (s) => s.snapshot?.opposingEffects ?? EMPTY_EFFECTS,
  );
}

const EMPTY_RECORDS: readonly OpponentCardRecord[] = Object.freeze([]);

/**
 * Cards the LOCAL player has used / lost this match. Strictly
 * local-side; the opponent panel never reflects anything from this.
 */
export function useFriendlyGraveyard(): readonly OpponentCardRecord[] {
  return useDeckTrackerStore(
    (s) => s.snapshot?.friendlyGraveyard ?? EMPTY_RECORDS,
  );
}
