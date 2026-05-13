import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { SavedDecksList } from '../src/components/Decklist';
import { I18nProvider, type LanguagePreference } from '../src/i18n';
import { useDecksStore } from '../src/stores/decks-store';

function renderList(props = {}, preference: LanguagePreference = 'en-US') {
  return render(
    <I18nProvider preference={preference}>
      <SavedDecksList {...props} />
    </I18nProvider>,
  );
}

describe('SavedDecksList', () => {
  let saved: typeof window.hdt.decks;
  let savedCards: typeof window.hdt.cards;

  beforeEach(() => {
    saved = window.hdt.decks;
    savedCards = window.hdt.cards;
    useDecksStore.setState({ decks: [], loading: false, error: null });
  });

  afterEach(() => {
    (window.hdt as { decks: typeof window.hdt.decks }).decks = saved;
    (window.hdt as { cards: typeof window.hdt.cards }).cards = savedCards;
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

  it('syncs before rendering cached my decks', async () => {
    const callOrder: string[] = [];
    const list = vi.fn(async () => {
      callOrder.push('list');
      return [];
    });
    const syncFromLive = vi.fn(async () => {
      callOrder.push('sync');
      return {
        ok: false as const,
        source: 'unavailable' as const,
        synced: 0,
        skippedNonCollectible: 0,
        skippedUnknownClass: 0,
        startedAt: 0,
        finishedAt: 0,
      };
    });
    (window.hdt as { decks: typeof window.hdt.decks }).decks = {
      ...saved,
      list,
      syncFromLive,
    };

    await act(async () => {
      renderList();
    });

    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(syncFromLive).toHaveBeenCalled();
    expect(callOrder[0]).toBe('sync');
    expect(callOrder).toContain('list');
  });

  it('manual sync button triggers live sync, refreshes list, and renders synced decks', async () => {
    const before = [
      {
        id: 'cached',
        name: 'Cached Warrior',
        class: 'WARRIOR' as const,
        format: 'Wild' as const,
        version: 1,
        cardCount: 30,
        updatedAt: 0,
      },
    ];
    const after = [
      ...before,
      {
        id: 'live-hunter',
        name: 'Companion Hunter',
        class: 'HUNTER' as const,
        format: 'Standard' as const,
        version: 1,
        cardCount: 30,
        updatedAt: 1,
      },
    ];
    const list = vi
      .fn()
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);
    const syncFromLive = vi.fn().mockResolvedValue({
      ok: true,
      source: 'live' as const,
      synced: 2,
      skippedNonCollectible: 0,
      skippedUnknownClass: 0,
      startedAt: 0,
      finishedAt: 1,
    });
    (window.hdt as { decks: typeof window.hdt.decks }).decks = {
      ...saved,
      list,
      syncFromLive,
    };

    await act(async () => {
      renderList();
    });
    await screen.findByText('Cached Warrior');
    const initialSyncCalls = syncFromLive.mock.calls.length;

    await act(async () => {
      fireEvent.click(screen.getByTestId('manual-deck-sync-button'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(syncFromLive.mock.calls.length).toBeGreaterThan(initialSyncCalls);
    expect(await screen.findByText('Companion Hunter')).toBeInTheDocument();
  });

  it('falls back to cached decks when sync rejects', async () => {
    const summaries = [
      {
        id: 'd-1',
        name: 'Cached Druid',
        class: 'DRUID' as const,
        format: 'Standard' as const,
        version: 1,
        cardCount: 30,
        updatedAt: 0,
      },
    ];
    const list = vi.fn().mockResolvedValue(summaries);
    const syncFromLive = vi.fn().mockRejectedValue(new Error('ipc broke'));
    (window.hdt as { decks: typeof window.hdt.decks }).decks = {
      ...saved,
      list,
      syncFromLive,
    };

    await act(async () => {
      renderList();
    });

    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(screen.getByText('Cached Druid')).toBeInTheDocument();
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

  it('filters saved decks by search text', async () => {
    const summaries = [
      {
        id: 'druid',
        name: 'Druid Combo',
        class: 'DRUID' as const,
        format: 'Standard' as const,
        version: 1,
        cardCount: 30,
        updatedAt: 0,
      },
      {
        id: 'mage',
        name: 'Mage Tempo',
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

    await screen.findByText('Druid Combo');
    fireEvent.change(screen.getByLabelText('Search saved decks'), {
      target: { value: 'Mage' },
    });

    expect(screen.getByText('Mage Tempo')).toBeInTheDocument();
    expect(screen.queryByText('Druid Combo')).not.toBeInTheDocument();
  });

  it('localizes class and format labels in Chinese', async () => {
    const summaries = [
      {
        id: 'hunter',
        name: '动物伙伴',
        class: 'HUNTER' as const,
        format: 'Standard' as const,
        version: 1,
        cardCount: 30,
        updatedAt: 0,
        source: 'hearthstone-live' as const,
      },
    ];
    const list = vi.fn().mockResolvedValue(summaries);
    (window.hdt as { decks: typeof window.hdt.decks }).decks = { ...saved, list };

    await act(async () => {
      renderList({}, 'zh-CN');
    });

    await screen.findByText('动物伙伴');
    expect(screen.getByText('猎人 · 标准')).toBeInTheDocument();
    expect(screen.getAllByText('炉石同步').length).toBeGreaterThan(0);
    expect(screen.queryByText('HUNTER · Standard')).not.toBeInTheDocument();
  });

  it('loads deck details, mana curve, and card names when a row expands', async () => {
    const summary = {
      id: 'live-hunter',
      name: 'Companion Hunter',
      class: 'HUNTER' as const,
      format: 'Standard' as const,
      version: 1,
      cardCount: 30,
      updatedAt: 1,
      source: 'hearthstone-live' as const,
      liveDeckId: 9393482502,
    };
    const detail = {
      ...summary,
      cards: [
        { cardId: 'EX1_531', count: 2 },
        { cardId: 'EX1_534', count: 1 },
      ],
      notes: '',
      tags: [],
      createdAt: 1,
    };
    const list = vi.fn().mockResolvedValue([summary]);
    const getById = vi.fn().mockResolvedValue(detail);
    const findById = vi.fn(async (cardId: string) => {
      if (cardId === 'EX1_531') {
        return {
          id: 'EX1_531',
          dbfId: 699,
          name: 'Animal Companion',
          cost: 3,
          cardClass: 'HUNTER' as const,
          rarity: 'COMMON' as const,
          set: 'EXPERT1',
          type: 'SPELL' as const,
          collectible: true,
        };
      }
      return {
        id: 'EX1_534',
        dbfId: 1144,
        name: 'Savannah Highmane',
        cost: 6,
        cardClass: 'HUNTER' as const,
        rarity: 'RARE' as const,
        set: 'EXPERT1',
        type: 'MINION' as const,
        collectible: true,
      };
    });
    (window.hdt as { decks: typeof window.hdt.decks }).decks = {
      ...saved,
      list,
      getById,
    };
    (window.hdt as { cards: typeof window.hdt.cards }).cards = {
      ...savedCards,
      findById,
    };

    await act(async () => {
      renderList();
    });

    await screen.findByText('Companion Hunter');
    fireEvent.click(screen.getByLabelText('Expand deck'));

    expect(await screen.findByText('Mana curve')).toBeInTheDocument();
    expect(screen.getByText('Key cards')).toBeInTheDocument();
    expect(screen.getByText('Full deck')).toBeInTheDocument();
    expect(screen.getAllByText('Animal Companion').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Savannah Highmane').length).toBeGreaterThan(0);
    expect(getById).toHaveBeenCalledWith('live-hunter');
    expect(findById).toHaveBeenCalledWith('EX1_531', 'en-US');
  });
});
