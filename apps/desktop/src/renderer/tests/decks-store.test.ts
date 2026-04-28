import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDecksStore } from '../src/stores/decks-store';

const originalDecks = (): typeof window.hdt.decks => window.hdt.decks;

describe('useDecksStore', () => {
  let saved: typeof window.hdt.decks;

  beforeEach(() => {
    saved = originalDecks();
    useDecksStore.setState({ decks: [], loading: false, error: null });
  });

  afterEach(() => {
    (window.hdt as { decks: typeof window.hdt.decks }).decks = saved;
  });

  it('initial state: decks=[] loading=false error=null', () => {
    const state = useDecksStore.getState();
    expect(state.decks).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('refresh() commits the IPC list result and toggles loading', async () => {
    const summaries = [
      {
        id: 'd-1',
        name: 'A',
        class: 'DRUID' as const,
        format: 'Standard' as const,
        version: 1,
        cardCount: 30,
        updatedAt: 0,
      },
    ];
    const list = vi.fn().mockResolvedValue(summaries);
    (window.hdt as { decks: typeof window.hdt.decks }).decks = { ...saved, list };

    await useDecksStore.getState().refresh();

    expect(list).toHaveBeenCalledOnce();
    const state = useDecksStore.getState();
    expect(state.decks).toEqual(summaries);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('refresh() captures error.message on rejection', async () => {
    const list = vi.fn().mockRejectedValue(new Error('boom'));
    (window.hdt as { decks: typeof window.hdt.decks }).decks = { ...saved, list };

    await useDecksStore.getState().refresh();

    const state = useDecksStore.getState();
    expect(state.loading).toBe(false);
    expect(state.error).toBe('boom');
    expect(state.decks).toEqual([]);
  });

  it('createDeck() resolves with new deck and refreshes list', async () => {
    const created = {
      id: 'd-2',
      name: 'New',
      class: 'MAGE' as const,
      format: 'Wild' as const,
      version: 1,
      cards: [],
      notes: '',
      tags: [],
      createdAt: 0,
      updatedAt: 0,
    };
    const summaries = [
      {
        id: 'd-2',
        name: 'New',
        class: 'MAGE' as const,
        format: 'Wild' as const,
        version: 1,
        cardCount: 0,
        updatedAt: 0,
      },
    ];
    const create = vi.fn().mockResolvedValue(created);
    const list = vi.fn().mockResolvedValue(summaries);
    (window.hdt as { decks: typeof window.hdt.decks }).decks = { ...saved, create, list };

    const result = await useDecksStore
      .getState()
      .createDeck({ name: 'New', class: 'MAGE', format: 'Wild' });
    expect(result).toEqual(created);
    expect(create).toHaveBeenCalledOnce();
    expect(list).toHaveBeenCalledOnce();
    expect(useDecksStore.getState().decks).toEqual(summaries);
  });

  it('deleteDeck() calls IPC then refreshes', async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const list = vi.fn().mockResolvedValue([]);
    (window.hdt as { decks: typeof window.hdt.decks }).decks = { ...saved, delete: del, list };

    await useDecksStore.getState().deleteDeck('d-1');
    expect(del).toHaveBeenCalledWith('d-1');
    expect(list).toHaveBeenCalledOnce();
  });
});
