import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { DeckTrackerSnapshot } from '@hdt/core';
import type { CardDef } from '@hdt/hearthdb';
import App from '../src/App';
import { routes } from '../src/routes';
import { useDeckTrackerStore } from '../src/stores/deck-tracker-store';

function renderRoute(initialEntry = '/') {
  const router = createMemoryRouter(
    [{ path: '/', element: <App />, children: routes }],
    { initialEntries: [initialEntry] },
  );
  return render(<RouterProvider router={router} />);
}

function makeSnapshot(overrides: Partial<DeckTrackerSnapshot> = {}): DeckTrackerSnapshot {
  return {
    phase: 'IN_MATCH',
    matchInfo: null,
    deck: null,
    pendingDeckSelection: null,
    friendlyHand: [],
    opposingHandCount: 0,
    opponent: {
      revealed: [],
      graveyard: [],
    },
    friendlyDeckCount: 0,
    friendlyEffects: [],
    opposingEffects: [],
    boardAttack: { friendly: 0, opposing: 0 },
    error: null,
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('Dashboard rank display', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useDeckTrackerStore.setState({
      snapshot: null,
      pendingSelection: null,
      dialogDismissed: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows no active deck when medalInfo is null', async () => {
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(false);

    renderRoute();
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });

    expect(screen.getByText(/Rank:/)).toBeInTheDocument();
    expect(screen.getByText(/Unavailable/)).toBeInTheDocument();
    expect(screen.getByText('No Active Deck')).toBeInTheDocument();
    expect(screen.queryByText(/Control Warrior/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Control Odyn Warrior/i)).not.toBeInTheDocument();
  });

  it('shows "Star N" when starLevel > 0 and not legend', async () => {
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(true);
    window.hdt.hearthmirror.getBattleTag = vi.fn().mockResolvedValue({ name: 'P', fullBattleTag: 'P#1' });
    window.hdt.hearthmirror.getMedalInfo = vi.fn().mockResolvedValue({
      standard: { legendRank: 0, starLevel: 5, bestStarLevel: 5, winStreak: 0, seasonGames: 10, seasonWins: 6 },
      wild: null,
      classic: null,
      twist: null,
    });

    renderRoute();
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });

    expect(screen.getByText(/Star 5/)).toBeInTheDocument();
  });

  it('shows "Legend N" when legendRank > 0', async () => {
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(true);
    window.hdt.hearthmirror.getBattleTag = vi.fn().mockResolvedValue({ name: 'P', fullBattleTag: 'P#1' });
    window.hdt.hearthmirror.getMedalInfo = vi.fn().mockResolvedValue({
      standard: { legendRank: 42, starLevel: 51, bestStarLevel: 51, winStreak: 0, seasonGames: 50, seasonWins: 30 },
      wild: null,
      classic: null,
      twist: null,
    });

    renderRoute();
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });

    expect(screen.getByText(/Legend 42/)).toBeInTheDocument();
  });

  it('does not render the mock warrior deck in the overlay route', async () => {
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(false);

    renderRoute('/overlay');
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });

    expect(screen.queryByText(/Control Warrior/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Control Odyn Warrior/i)).not.toBeInTheDocument();
  });

  it('renders opponent cards from the tracker snapshot in the sidebar', async () => {
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(false);
    window.hdt.cards.findById = vi.fn(async (cardId: string) => {
      if (cardId !== 'CS2_029') return null;
      const cardDef: CardDef = {
        id: 'CS2_029',
        dbfId: 0,
        name: 'Fireball',
        cost: 4,
        cardClass: 'MAGE',
        rarity: 'COMMON',
        set: 'TEST',
        type: 'SPELL',
        collectible: true,
      };
      return cardDef;
    });
    useDeckTrackerStore.setState({
      snapshot: makeSnapshot({
        opponent: {
          revealed: [{ entityId: 20, cardId: 'CS2_029', zone: 'PLAY', order: 1 }],
          graveyard: [],
        },
      }),
    });

    renderRoute();
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByText('Fireball')).toBeInTheDocument();
  });
});
