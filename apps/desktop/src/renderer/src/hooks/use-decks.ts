import { useEffect, useState } from 'react';

import type { DeckDetail, DeckSummary } from '@hdt/core';

import { useDecksStore } from '../stores/decks-store';

/**
 * Read the saved-decks list from the renderer store. Auto-refreshes on first
 * use; component remounts that share the store (same renderer session) reuse
 * the in-memory copy and only refresh on explicit mutations.
 */
export function useDecks(options: { sync?: boolean } = {}): {
  decks: DeckSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const decks = useDecksStore((s) => s.decks);
  const loading = useDecksStore((s) => s.loading);
  const error = useDecksStore((s) => s.error);
  const refresh = useDecksStore((s) => s.refresh);
  const syncAndRefresh = useDecksStore((s) => s.syncAndRefresh);
  const sync = options.sync === true;

  useEffect(() => {
    if (sync) void syncAndRefresh();
    else void refresh();
  }, [sync, refresh, syncAndRefresh]);

  return { decks, loading, error, refresh };
}

/**
 * Fetch a single saved deck by id. Returns `null` while loading and after a
 * confirmed-missing fetch.
 */
export function useDeckDetail(id: string | null): {
  deck: DeckDetail | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
} {
  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async (): Promise<void> => {
    if (!id) {
      setDeck(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const detail = await window.hdt.decks.getById(id);
      setDeck(detail);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return { deck, loading, error, reload };
}
