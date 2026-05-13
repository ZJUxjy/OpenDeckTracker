import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

import { useDecks } from '../src/hooks/use-decks';
import { useDecksStore } from '../src/stores/decks-store';

function Probe(): ReactElement {
  const { decks } = useDecks();
  return <div data-testid="count">{decks.length}</div>;
}

function SyncProbe(): ReactElement {
  const { decks } = useDecks({ sync: true });
  return <div data-testid="count">{decks.length}</div>;
}

describe('useDecks', () => {
  let saved: typeof window.hdt.decks;

  beforeEach(() => {
    saved = window.hdt.decks;
    useDecksStore.setState({ decks: [], loading: false, error: null });
  });

  afterEach(() => {
    (window.hdt as { decks: typeof window.hdt.decks }).decks = saved;
  });

  it('auto-refreshes on mount and exposes the current decks slice', async () => {
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

    let result;
    await act(async () => {
      result = render(<Probe />);
    });

    expect(list).toHaveBeenCalledOnce();
    expect(result!.getByTestId('count').textContent).toBe('1');
  });

  it('retries live deck sync while the synced deck list hydrates', async () => {
    vi.useFakeTimers();
    try {
      const syncFromLive = vi.fn().mockResolvedValue({
        ok: true,
        source: 'live' as const,
        synced: 1,
        skippedNonCollectible: 0,
        skippedUnknownClass: 0,
        startedAt: 0,
        finishedAt: 0,
      });
      const list = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'd-1',
            name: 'Hydrated Hunter',
            class: 'HUNTER' as const,
            format: 'Standard' as const,
            version: 1,
            cardCount: 30,
            updatedAt: 0,
          },
        ]);
      (window.hdt as { decks: typeof window.hdt.decks }).decks = {
        ...saved,
        syncFromLive,
        list,
      };

      let result;
      await act(async () => {
        result = render(<SyncProbe />);
      });

      expect(syncFromLive).toHaveBeenCalledTimes(1);
      expect(result!.getByTestId('count').textContent).toBe('0');

      await act(async () => {
        vi.advanceTimersByTime(2_000);
        await Promise.resolve();
      });

      expect(syncFromLive).toHaveBeenCalledTimes(2);
      expect(result!.getByTestId('count').textContent).toBe('1');
    } finally {
      vi.useRealTimers();
    }
  });
});
