import { create } from 'zustand';

import type { CreateDeckInput, DeckDetail, DeckSummary, UpdateDeckPatch } from '@hdt/core';

interface DecksStoreState {
  decks: DeckSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<DeckSummary[]>;
  /**
   * Call `syncFromLive()` against the main-process sync host first, then
   * always re-fetch the canonical list. A failed sync (Hearthstone
   * unavailable, card db not ready, error) must not block the list
   * refresh — the renderer keeps cached local decks visible.
   */
  syncAndRefresh: () => Promise<DeckSummary[]>;
  createDeck: (input: CreateDeckInput) => Promise<DeckDetail>;
  updateDeck: (id: string, patch: UpdateDeckPatch) => Promise<DeckDetail>;
  duplicateDeck: (id: string) => Promise<DeckDetail>;
  deleteDeck: (id: string) => Promise<void>;
}

/**
 * Renderer-side mirror of the saved-decks list. The truth source is the
 * main-process `DeckStore` exposed via `window.hdt.decks.*` IPC. Mutating
 * actions on this store always re-fetch the list after the IPC resolves so
 * the renderer view rehydrates from the canonical store.
 */
export const useDecksStore = create<DecksStoreState>((set) => ({
  decks: [],
  loading: false,
  error: null,
  async refresh() {
    set({ loading: true, error: null });
    try {
      const decks = await window.hdt.decks.list();
      set({ decks, loading: false });
      return decks;
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
      return [];
    }
  },
  async syncAndRefresh() {
    set({ loading: true, error: null });
    try {
      try {
        const syncResult = await window.hdt.decks.syncFromLive();
        console.log('[decks-sync:auto] result', syncResult);
      } catch (err) {
        // Sync failures stay non-fatal so cached decks keep rendering.
        console.warn('[decks-store] syncFromLive failed', err);
      }
      const decks = await window.hdt.decks.list();
      console.log('[decks-sync:auto] refreshed decks', decks.map((d) => ({
        id: d.id,
        name: d.name,
        class: d.class,
        format: d.format,
        cardCount: d.cardCount,
      })));
      set({ decks, loading: false });
      return decks;
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
      return [];
    }
  },
  async createDeck(input) {
    const created = await window.hdt.decks.create(input);
    set({ decks: await window.hdt.decks.list() });
    return created;
  },
  async updateDeck(id, patch) {
    const updated = await window.hdt.decks.update(id, patch);
    set({ decks: await window.hdt.decks.list() });
    return updated;
  },
  async duplicateDeck(id) {
    const dup = await window.hdt.decks.duplicate(id);
    set({ decks: await window.hdt.decks.list() });
    return dup;
  },
  async deleteDeck(id) {
    await window.hdt.decks.delete(id);
    set({ decks: await window.hdt.decks.list() });
  },
}));
