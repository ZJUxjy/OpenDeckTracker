import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { SaveLiveDeckButton } from '../src/components/SaveLiveDeckButton';
import { I18nProvider } from '../src/i18n';
import { useDecksStore } from '../src/stores/decks-store';

const liveDeck = {
  name: 'Live Druid',
  class: 'DRUID' as const,
  format: 'Standard' as const,
  cards: [
    { cardId: 'A', count: 2 },
    { cardId: 'B', count: 1 },
  ],
};

function renderButton(deck = liveDeck) {
  return render(
    <I18nProvider preference="en-US">
      <SaveLiveDeckButton liveDeck={deck} />
    </I18nProvider>,
  );
}

describe('SaveLiveDeckButton', () => {
  let saved: typeof window.hdt.decks;

  beforeEach(() => {
    saved = window.hdt.decks;
    useDecksStore.setState({ decks: [], loading: false, error: null });
  });

  afterEach(() => {
    (window.hdt as { decks: typeof window.hdt.decks }).decks = saved;
  });

  it('renders when no saved deck matches the live deck', async () => {
    (window.hdt as { decks: typeof window.hdt.decks }).decks = {
      ...saved,
      list: vi.fn().mockResolvedValue([]),
    };

    await act(async () => {
      renderButton();
    });

    expect(screen.getByTestId('save-live-button')).toBeInTheDocument();
  });

  it('clicking calls saveFromLive and refreshes the list', async () => {
    const saveFromLive = vi.fn().mockResolvedValue({
      id: 'd-new',
      name: 'Live Druid',
      class: 'DRUID',
      format: 'Standard',
      version: 1,
      cards: liveDeck.cards,
      notes: '',
      tags: [],
      createdAt: 0,
      updatedAt: 0,
    });
    const list = vi.fn().mockResolvedValue([]);
    (window.hdt as { decks: typeof window.hdt.decks }).decks = { ...saved, saveFromLive, list };

    await act(async () => {
      renderButton();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('save-live-button'));
      await Promise.resolve();
    });

    await waitFor(() => expect(saveFromLive).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByTestId('save-live-saved')).not.toBeNull());
  });

  it('renders localized NonCollectibleSnapshotError message', async () => {
    const error = Object.assign(new Error('NonCollectibleSnapshotError: TOKEN_X'), {
      name: 'NonCollectibleSnapshotError',
    });
    const saveFromLive = vi.fn().mockRejectedValue(error);
    const list = vi.fn().mockResolvedValue([]);
    (window.hdt as { decks: typeof window.hdt.decks }).decks = { ...saved, saveFromLive, list };

    await act(async () => {
      renderButton();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('save-live-button'));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.queryByTestId('save-live-error')).not.toBeNull());
    expect(screen.getByTestId('save-live-error').textContent).toContain('cannot be saved');
  });

  it('returns null when liveDeck is null', () => {
    const { container } = render(
      <I18nProvider preference="en-US">
        <SaveLiveDeckButton liveDeck={null} />
      </I18nProvider>,
    );
    expect(container.firstChild).toBeNull();
  });
});
