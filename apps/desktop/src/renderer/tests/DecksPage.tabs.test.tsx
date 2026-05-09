import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DecksPage } from '../src/components/DecksPage';
import { I18nProvider } from '../src/i18n';
import { useDecksStore } from '../src/stores/decks-store';

function renderPage(locale: 'en-US' | 'zh-CN' = 'en-US') {
  return render(
    <I18nProvider preference={locale}>
      <DecksPage />
    </I18nProvider>,
  );
}

describe('DecksPage tabs', () => {
  let saved: typeof window.hdt.decks;
  let popularDecksSaved: typeof window.hdt.popularDecks;

  beforeEach(() => {
    saved = window.hdt.decks;
    popularDecksSaved = window.hdt.popularDecks;
    useDecksStore.setState({ decks: [], loading: false, error: null });
    (window.hdt as { decks: typeof window.hdt.decks }).decks = {
      ...saved,
      list: vi.fn().mockResolvedValue([]),
    };
    (window as { hdt: { popularDecks: typeof window.hdt.popularDecks } }).hdt.popularDecks = {
      list: vi.fn().mockResolvedValue({ decks: [], source: 'seed', fetchedAt: null }),
      syncStart: vi.fn().mockResolvedValue({ ok: true, fetchedAt: 'X', count: 0 }),
      syncStatus: vi.fn().mockResolvedValue({ inFlight: false, lastFetchedAt: null }),
      onSyncProgress: vi.fn().mockReturnValue(() => undefined),
    };
  });

  afterEach(() => {
    (window.hdt as { decks: typeof window.hdt.decks }).decks = saved;
    (window as { hdt: { popularDecks: typeof window.hdt.popularDecks } }).hdt.popularDecks = popularDecksSaved;
  });

  it('Saved tab is active on mount', async () => {
    await act(async () => {
      renderPage();
    });
    const savedTab = screen.getByRole('tab', { name: 'Saved' });
    expect(savedTab.getAttribute('data-state')).toBe('active');
  });

  it('shows the saved-decks empty state when Saved tab is active', async () => {
    await act(async () => {
      renderPage();
    });
    await waitFor(() => expect(screen.queryByLabelText('Create deck')).not.toBeNull());
  });

  it('switches to Finder content when the Finder tab is clicked', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderPage();
    });
    await user.click(screen.getByRole('tab', { name: 'Finder' }));
    await waitFor(() => expect(screen.queryByText('Deck Finder')).not.toBeNull());
  });

  it('renders Chinese tab labels under zh-CN locale', async () => {
    await act(async () => {
      renderPage('zh-CN');
    });
    expect(screen.getByRole('tab', { name: '已保存' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '查找' })).toBeInTheDocument();
  });
});
