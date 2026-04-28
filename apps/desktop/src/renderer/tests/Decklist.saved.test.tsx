import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { SavedDecksList } from '../src/components/Decklist';
import { I18nProvider } from '../src/i18n';
import { useDecksStore } from '../src/stores/decks-store';

function renderList(props = {}) {
  return render(
    <I18nProvider preference="en-US">
      <SavedDecksList {...props} />
    </I18nProvider>,
  );
}

describe('SavedDecksList', () => {
  let saved: typeof window.hdt.decks;

  beforeEach(() => {
    saved = window.hdt.decks;
    useDecksStore.setState({ decks: [], loading: false, error: null });
  });

  afterEach(() => {
    (window.hdt as { decks: typeof window.hdt.decks }).decks = saved;
  });

  it('groups decks by class and renders card counts', async () => {
    const summaries = [
      {
        id: 'd-1',
        name: 'Druid Combo',
        class: 'DRUID' as const,
        format: 'Standard' as const,
        version: 1,
        cardCount: 30,
        updatedAt: 0,
      },
      {
        id: 'd-2',
        name: 'Mage Tempo',
        class: 'MAGE' as const,
        format: 'Wild' as const,
        version: 2,
        cardCount: 30,
        updatedAt: 0,
      },
    ];
    const list = vi.fn().mockResolvedValue(summaries);
    (window.hdt as { decks: typeof window.hdt.decks }).decks = { ...saved, list };

    await act(async () => {
      renderList();
    });

    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(screen.getByText('Druid Combo')).toBeInTheDocument();
    expect(screen.getByText('Mage Tempo')).toBeInTheDocument();
    expect(screen.getByTestId('group-DRUID')).toBeInTheDocument();
    expect(screen.getByTestId('group-MAGE')).toBeInTheDocument();
    const badges = screen.getAllByTestId('card-count-badge');
    expect(badges[0]?.textContent).toBe('30 / 30');
  });

  it('renders empty state with create + import CTAs when no decks', async () => {
    const list = vi.fn().mockResolvedValue([]);
    (window.hdt as { decks: typeof window.hdt.decks }).decks = { ...saved, list };
    const onCreate = vi.fn();
    const onImport = vi.fn();

    await act(async () => {
      renderList({ onCreate, onImport });
    });

    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(screen.getByTestId('decks-empty-state')).toBeInTheDocument();
    expect(screen.getByText('No saved decks yet')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Create deck'));
    fireEvent.click(screen.getByLabelText('Import deckstring'));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onImport).toHaveBeenCalledOnce();
  });

  it('amber count badge shows for incomplete decks', async () => {
    const list = vi.fn().mockResolvedValue([
      {
        id: 'd-1',
        name: 'WIP',
        class: 'DRUID' as const,
        format: 'Standard' as const,
        version: 1,
        cardCount: 16,
        updatedAt: 0,
      },
    ]);
    (window.hdt as { decks: typeof window.hdt.decks }).decks = { ...saved, list };

    await act(async () => {
      renderList();
    });

    await waitFor(() => expect(list).toHaveBeenCalled());
    const badge = screen.getByTestId('card-count-badge');
    expect(badge.textContent).toBe('16 / 30');
    expect(badge.className).toContain('amber');
  });

  it('renders an action trigger per deck row', async () => {
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
      {
        id: 'd-2',
        name: 'B',
        class: 'MAGE' as const,
        format: 'Wild' as const,
        version: 1,
        cardCount: 30,
        updatedAt: 0,
      },
    ];
    const list = vi.fn().mockResolvedValue(summaries);
    (window.hdt as { decks: typeof window.hdt.decks }).decks = { ...saved, list };

    await act(async () => {
      renderList();
    });

    await waitFor(() => expect(list).toHaveBeenCalled());
    // One DropdownMenu trigger per row, labelled by the row's edit action.
    expect(screen.getAllByLabelText('Edit')).toHaveLength(2);
    expect(screen.getByTestId('deck-row-d-1')).toBeInTheDocument();
    expect(screen.getByTestId('deck-row-d-2')).toBeInTheDocument();
  });
});
