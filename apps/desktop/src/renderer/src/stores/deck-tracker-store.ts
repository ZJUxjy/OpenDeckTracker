import { create } from 'zustand';
import type { DeckTrackerEvent, DeckTrackerSnapshot } from '@hdt/core';

export interface PendingDeckSelection {
  decks: { id: number; name: string; hero: string }[];
}

interface DeckTrackerStoreState {
  snapshot: DeckTrackerSnapshot | null;
  pendingSelection: PendingDeckSelection | null;
  setSnapshot: (snapshot: DeckTrackerSnapshot) => void;
  applyEvent: (event: DeckTrackerEvent) => void;
  clearPendingSelection: () => void;
}

/**
 * Renderer-side mirror of the main-process DeckTracker.
 *
 * Subscribes to two IPC streams (per design D8 in the OpenSpec change):
 *   - `deck-tracker:state` → `setSnapshot(snapshot)`  (every poll)
 *   - `deck-tracker:event` → `applyEvent(event)`       (lifecycle moments)
 *
 * Wiring is done in `useDeckTracker()`; components consume via
 * Zustand selectors.
 */
export const useDeckTrackerStore = create<DeckTrackerStoreState>((set) => ({
  snapshot: null,
  pendingSelection: null,
  setSnapshot: (snapshot) => set({ snapshot }),
  applyEvent: (event) => {
    if (event.type === 'needs-deck-selection') {
      set({ pendingSelection: { decks: event.decks ?? [] } });
    } else if (event.type === 'match-ended') {
      // On match end, clear any pending selection (it's stale now).
      set({ pendingSelection: null });
    }
    // state-change / match-started / error: no extra side effects beyond
    // the regular snapshot push (which arrives via `setSnapshot`).
  },
  clearPendingSelection: () => set({ pendingSelection: null }),
}));
