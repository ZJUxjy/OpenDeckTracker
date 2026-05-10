import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DeckSelectDialog } from '../src/components/DeckSelectDialog';
import { I18nProvider } from '../src/i18n';
import { useDecksStore } from '../src/stores/decks-store';
import { useDeckTrackerStore } from '../src/stores/deck-tracker-store';

function renderDialog() {
  return render(
    <I18nProvider preference="en-US">
      <DeckSelectDialog />
    </I18nProvider>,
  );
}

describe('DeckSelectDialog with saved decks', () => {
  let saved: typeof window.hdt;

  beforeEach(() => {
    saved = window.hdt;
    const savedSummaries = [
      {
        id: 'saved-1',
        name: 'My Saved Druid',
        class: 'DRUID' as const,
        format: 'Standard' as const,
        version: 2,
        cardCount: 30,
        updatedAt: 0,
      },
    ];
    // Make refresh() pick up the saved deck on mount.
    (window.hdt as { decks: typeof window.hdt.decks }).decks = {
      ...saved.decks,
      list: vi.fn().mockResolvedValue(savedSummaries),
    };
    useDecksStore.setState({ decks: savedSummaries, loading: false, error: null });
    useDeckTrackerStore.setState({
      snapshot: null,
      pendingSelection: {
        decks: [
          { id: 1001, name: 'Live Mage', hero: 'HERO_08' },
          { id: 1002, name: 'Live Hunter', hero: 'HERO_05' },
        ],
      },
      dialogDismissed: false,
      setSnapshot: () => undefined,
      applyEvent: () => undefined,
      clearPendingSelection: () => undefined,
      markDialogDismissed: () => undefined,
    });
  });

  afterEach(() => {
    (window as { hdt: typeof window.hdt }).hdt = saved;
  });

  it('renders saved decks above live decks with a Saved badge', async () => {
    await act(async () => {
      renderDialog();
    });
    expect(screen.getByTestId('saved-deck-list')).toBeInTheDocument();
    expect(screen.getByTestId('live-deck-list')).toBeInTheDocument();
    expect(screen.getByTestId('saved-badge').textContent).toContain('Saved');
    // Saved row should appear before live rows in DOM order
    const allRows = screen.getAllByRole('button');
    const savedIdx = allRows.findIndex((b) => b.getAttribute('data-testid') === 'saved-deck-row-saved-1');
    const liveIdx = allRows.findIndex((b) => b.getAttribute('data-testid') === 'live-deck-row-1001');
    expect(savedIdx).toBeGreaterThan(-1);
    expect(liveIdx).toBeGreaterThan(savedIdx);
  });

  it('clicking a saved deck and confirming forwards selectSavedDeck', async () => {
    const selectSavedDeck = vi.fn().mockResolvedValue(undefined);
    const selectDeck = vi.fn().mockResolvedValue(undefined);
    (window as { hdt: typeof window.hdt }).hdt = {
      ...saved,
      deckTracker: { ...saved.deckTracker, selectSavedDeck, selectDeck },
    };

    await act(async () => {
      renderDialog();
    });

    fireEvent.click(screen.getByTestId('saved-deck-row-saved-1'));
    await act(async () => {
      fireEvent.click(screen.getByText('Confirm Selection'));
      await Promise.resolve();
    });

    await waitFor(() => expect(selectSavedDeck).toHaveBeenCalledWith('saved-1', 2));
    expect(selectDeck).not.toHaveBeenCalled();
  });

  it("user's click is sticky across snapshot re-emits (regression: pre-selection clobber)", async () => {
    const selectSavedDeck = vi.fn().mockResolvedValue(undefined);
    const selectDeck = vi.fn().mockResolvedValue(undefined);
    (window as { hdt: typeof window.hdt }).hdt = {
      ...saved,
      deckTracker: { ...saved.deckTracker, selectSavedDeck, selectDeck },
    };

    await act(async () => {
      renderDialog();
    });

    // User clicks the live deck (overriding the default first-saved-deck pre-selection).
    fireEvent.click(screen.getByTestId('live-deck-row-1001'));

    // Simulate the deck-tracker store pushing a fresh-reference pendingSelection
    // (which happens every poll tick — 500 ms).
    act(() => {
      useDeckTrackerStore.setState({
        snapshot: null,
        pendingSelection: {
          decks: [
            { id: 1001, name: 'Live Mage', hero: 'HERO_08' },
            { id: 1002, name: 'Live Hunter', hero: 'HERO_05' },
          ],
        },
        dialogDismissed: false,
        setSnapshot: () => undefined,
        applyEvent: () => undefined,
        clearPendingSelection: () => undefined,
        markDialogDismissed: () => undefined,
      });
    });

    // Confirm — the user's chosen live deck should be forwarded, not the
    // saved deck that was the initial default.
    await act(async () => {
      fireEvent.click(screen.getByText('Confirm Selection'));
      await Promise.resolve();
    });

    await waitFor(() => expect(selectDeck).toHaveBeenCalledWith(1001));
    expect(selectSavedDeck).not.toHaveBeenCalled();
  });

  it('syncs saved decks before showing choices and falls back when sync fails', async () => {
    const syncFromLive = vi.fn().mockResolvedValue({
      ok: false,
      source: 'unavailable',
      synced: 0,
      skippedNonCollectible: 0,
      skippedUnknownClass: 0,
      startedAt: 0,
      finishedAt: 0,
    });
    const savedSummaries = [
      {
        id: 'saved-1',
        name: 'My Saved Druid',
        class: 'DRUID' as const,
        format: 'Standard' as const,
        version: 2,
        cardCount: 30,
        updatedAt: 0,
      },
    ];
    (window.hdt as { decks: typeof window.hdt.decks }).decks = {
      ...saved.decks,
      list: vi.fn().mockResolvedValue(savedSummaries),
      syncFromLive,
    };
    useDecksStore.setState({ decks: savedSummaries, loading: false, error: null });

    await act(async () => {
      renderDialog();
    });

    await waitFor(() => expect(syncFromLive).toHaveBeenCalled());
    expect(screen.getByTestId('saved-deck-row-saved-1')).toBeInTheDocument();
  });

  it('clicking a live deck and confirming preserves the legacy selectDeck call', async () => {
    const selectSavedDeck = vi.fn().mockResolvedValue(undefined);
    const selectDeck = vi.fn().mockResolvedValue(undefined);
    (window as { hdt: typeof window.hdt }).hdt = {
      ...saved,
      deckTracker: { ...saved.deckTracker, selectSavedDeck, selectDeck },
    };

    await act(async () => {
      renderDialog();
    });

    fireEvent.click(screen.getByTestId('live-deck-row-1001'));
    await act(async () => {
      fireEvent.click(screen.getByText('Confirm Selection'));
      await Promise.resolve();
    });

    await waitFor(() => expect(selectDeck).toHaveBeenCalledWith(1001));
    expect(selectSavedDeck).not.toHaveBeenCalled();
  });
});
