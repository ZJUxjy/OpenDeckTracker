import { create } from 'zustand';

import type { CreateDeckInput, DeckDetail, DeckSummary, UpdateDeckPatch } from '@hdt/core';

interface DecksStoreState {
  decks: DeckSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
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
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
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
