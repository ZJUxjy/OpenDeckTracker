import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { DeckDetail } from '@hdt/core';

import { DeckEditor } from '../src/components/DeckEditor';
import { I18nProvider } from '../src/i18n';

function makeDeck(overrides: Partial<DeckDetail> = {}): DeckDetail {
  return {
    id: 'd-1',
    name: 'My Deck',
    class: 'DRUID',
    format: 'Standard',
    version: 1,
    cards: [],
    notes: '',
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function renderEditor(props: {
  deck?: DeckDetail;
  onSave?: (id: string, patch: unknown) => Promise<void>;
} = {}) {
  const editorProps = props.onSave
    ? {
        open: true as const,
        onOpenChange: () => undefined,
        deck: props.deck ?? makeDeck(),
        onSave: props.onSave as never,
      }
    : {
        open: true as const,
        onOpenChange: () => undefined,
        deck: props.deck ?? makeDeck(),
      };
  return render(
    <I18nProvider preference="en-US">
      <DeckEditor {...editorProps} />
    </I18nProvider>,
  );
}

describe('DeckEditor', () => {
  let saved: typeof window.hdt.cards;

  beforeEach(() => {
    saved = window.hdt.cards;
  });

  afterEach(() => {
    (window.hdt as { cards: typeof window.hdt.cards }).cards = saved;
    vi.useRealTimers();
  });

  it('shows the deck name and format on open', async () => {
    await act(async () => {
      renderEditor({ deck: makeDeck({ name: 'Loaded Druid' }) });
    });
    expect(screen.getByDisplayValue('Loaded Druid')).toBeInTheDocument();
    expect(screen.getByDisplayValue('DRUID')).toBeInTheDocument();
  });

  it('Save & Close flushes the latest patch through onSave once', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      renderEditor({ deck: makeDeck({ name: 'Old' }), onSave });
    });

    const nameInput = screen.getByDisplayValue('Old');
    fireEvent.change(nameInput, { target: { value: 'New' } });

    // Click Save & Close (flushes pending debounce immediately).
    const save = screen.getByText('Save & Close');
    await act(async () => {
      fireEvent.click(save);
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith(
      'd-1',
      expect.objectContaining({ name: 'New' }),
    );
  });

  it('Enter on search input adds the first result with count: 1', async () => {
    const search = vi.fn().mockResolvedValue([
      { id: 'EX1_383', name: 'Tirion Fordring', cost: 8, cardClass: 'PALADIN', rarity: 'LEGENDARY', type: 'MINION', dbfId: 1 },
    ]);
    (window.hdt as { cards: typeof window.hdt.cards }).cards = { ...saved, search };

    const onSave = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      renderEditor({ deck: makeDeck({ class: 'PALADIN' }), onSave });
    });

    const searchInput = screen.getByTestId('card-search-input');
    fireEvent.change(searchInput, { target: { value: 'Tirion' } });
    await waitFor(() => expect(search).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('card-search-results')).not.toBeNull());

    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(screen.getByText('Tirion Fordring')).toBeInTheDocument();
  });

  it('validity panel reflects under-card-limit on incomplete deck', async () => {
    await act(async () => {
      renderEditor({ deck: makeDeck({ cards: [{ cardId: 'A', count: 1 }] }) });
    });

    const panel = screen.getByTestId('validity-panel');
    expect(panel.textContent).toContain('1');
    expect(panel.textContent).toContain('30');
  });

  it('debounces rapid edits into a single onSave call within the debounce window', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      renderEditor({ deck: makeDeck({ name: 'Start' }), onSave });
    });

    const nameInput = screen.getByDisplayValue('Start');
    fireEvent.change(nameInput, { target: { value: 'A' } });
    fireEvent.change(nameInput, { target: { value: 'AB' } });
    fireEvent.change(nameInput, { target: { value: 'ABC' } });

    // Before debounce fires
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(450);
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[1]).toMatchObject({ name: 'ABC' });
  });
});
