import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, MemoryRouter } from 'react-router';
import { Profiler } from 'react';
import { Dashboard } from '../src/components/Dashboard';
import type { DeckTrackerSnapshot } from '@hdt/core';
import type { CardDef } from '@hdt/hearthdb';
import App from '../src/App';
import { routes } from '../src/routes';
import { useDeckTrackerStore } from '../src/stores/deck-tracker-store';

function renderRoute(initialEntry = '/tracker') {
  const router = createMemoryRouter([{ path: '/', element: <App />, children: routes }], {
    initialEntries: [initialEntry],
  });
  return render(<RouterProvider router={router} />);
}

function makeSnapshot(overrides: Partial<DeckTrackerSnapshot> = {}): DeckTrackerSnapshot {
  return {
    phase: 'IN_MATCH',
    matchInfo: null,
    deck: null,
    pendingDeckSelection: null,
    friendlyHand: [],
    friendlyHandExtras: [],
    opposingHandCount: 0,
    opponent: {
      revealed: [],
      graveyard: [],
    },
    opponentClass: null,
    friendlyGraveyard: [],
    friendlyDeckCount: 0,
    friendlyEffects: [],
    opposingEffects: [],
    boardAttack: { friendly: 0, opposing: 0 },
    boardAttackToFace: { friendly: 0, opposing: 0 },
    friendlyHero: null,
    opposingHero: null,
    playerClass: null,
    error: null,
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('Dashboard rank display', () => {
  it('does not redraw for unrelated board events but updates hand counts', async () => {
    const snapshot = makeSnapshot({ updatedAt: 1000 });
    useDeckTrackerStore.setState({ snapshot });
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(false);
    const commits = vi.fn();
    render(<MemoryRouter><Profiler id="dashboard" onRender={commits}><Dashboard /></Profiler></MemoryRouter>);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    commits.mockClear();
    for (let i = 1; i <= 30; i++) {
      act(() => useDeckTrackerStore.setState({ snapshot: {
        ...snapshot, updatedAt: 1000 + i, boardAttack: { friendly: i, opposing: 0 },
      } }));
    }
    expect(commits).not.toHaveBeenCalled();
    act(() => useDeckTrackerStore.setState({ snapshot: { ...snapshot, opposingHandCount: 5 } }));
    expect(screen.getByText('Hand: 5')).toBeInTheDocument();
    expect(commits).toHaveBeenCalledTimes(1);
  });
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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getByText(/Rank:/)).toBeInTheDocument();
    expect(screen.getByText(/Unavailable/)).toBeInTheDocument();
    expect(screen.getByText('No Active Deck')).toBeInTheDocument();
    expect(screen.queryByText(/Control Warrior/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Control Odyn Warrior/i)).not.toBeInTheDocument();
  });

  it('does not show match in progress while Hearthstone is connected but tracker is idle', async () => {
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(true);
    useDeckTrackerStore.setState({ snapshot: makeSnapshot({ phase: 'IDLE' }) });

    renderRoute();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // The removed status sidebar used to show a "Match in progress" banner; it
    // must not appear anywhere now. An idle, deckless tracker shows the Live
    // panel's "No Active Deck" empty state instead.
    expect(screen.queryByRole('heading', { name: 'Match in progress' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No Active Deck' })).toBeInTheDocument();
  });

  it('shows "Star N" when starLevel > 0 and not legend', async () => {
    useDeckTrackerStore.setState({ snapshot: makeSnapshot({ matchInfo: {
      gameType: 3, formatType: 2, missionId: 0, localPlayer: null, opposingPlayer: null,
      rankedSeasonId: 0, arenaSeasonId: 0, brawlSeasonId: 0,
    } }) });
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(true);
    window.hdt.hearthmirror.getBattleTag = vi
      .fn()
      .mockResolvedValue({ name: 'P', fullBattleTag: 'P#1' });
    window.hdt.hearthmirror.getMedalInfo = vi.fn().mockResolvedValue({
      standard: {
        legendRank: 0,
        starLevel: 5,
        bestStarLevel: 5,
        winStreak: 0,
        seasonGames: 10,
        seasonWins: 6,
      },
      wild: null,
      classic: null,
      twist: null,
    });

    renderRoute();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getByText(/Star 5/)).toBeInTheDocument();
  });

  it('shows "Legend N" when legendRank > 0', async () => {
    useDeckTrackerStore.setState({ snapshot: makeSnapshot({ matchInfo: {
      gameType: 3, formatType: 2, missionId: 0, localPlayer: null, opposingPlayer: null,
      rankedSeasonId: 0, arenaSeasonId: 0, brawlSeasonId: 0,
    } }) });
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(true);
    window.hdt.hearthmirror.getBattleTag = vi
      .fn()
      .mockResolvedValue({ name: 'P', fullBattleTag: 'P#1' });
    window.hdt.hearthmirror.getMedalInfo = vi.fn().mockResolvedValue({
      standard: {
        legendRank: 42,
        starLevel: 51,
        bestStarLevel: 51,
        winStreak: 0,
        seasonGames: 50,
        seasonWins: 30,
      },
      wild: null,
      classic: null,
      twist: null,
    });

    renderRoute();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getByText(/Legend 42/)).toBeInTheDocument();
  });

  it('does not render the mock warrior deck in the overlay route', async () => {
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(false);

    renderRoute('/overlay');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

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
          revealed: [{ entityId: 20, cardId: 'CS2_029', zone: 'PLAY', order: 1, created: false }],
          graveyard: [],
        },
      }),
    });

    renderRoute();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('Fireball')).toBeInTheDocument();
  });

  it('keeps all revealed opponent cards available beyond the first six', async () => {
    useDeckTrackerStore.setState({
      snapshot: makeSnapshot({
        opponent: {
          revealed: Array.from({ length: 8 }, (_, index) => ({
            entityId: index + 1,
            cardId: `VISIBLE_CARD_${index}`,
            zone: 'PLAY' as const,
            order: index,
            created: false,
          })),
          graveyard: [],
        },
      }),
    });
    window.hdt.cards.findById = vi.fn().mockImplementation(async (id: string) => ({
      id, dbfId: 1, name: id, type: 'SPELL', cost: 1,
    } as CardDef));

    renderRoute();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getByText('VISIBLE_CARD_7')).toBeInTheDocument();
  });

  it('renders dashboard stats as a semantic status grid', async () => {
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(true);
    useDeckTrackerStore.setState({ snapshot: makeSnapshot() });

    renderRoute();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getByTestId('dashboard-stat-grid')).toHaveClass('dashboard-stat-grid');
    expect(screen.getAllByTestId('dashboard-stat-card').map((card) => card.dataset.tone)).toEqual([
      'deck',
      'hand',
      'live',
      'warning',
    ]);
  });

  it('formats match time as elapsed duration instead of a wall-clock timestamp', async () => {
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(true);
    useDeckTrackerStore.setState({
      snapshot: makeSnapshot({
        phase: 'IN_MATCH',
        matchStartedAt: 1_000,
        updatedAt: 301_000,
      } as Partial<DeckTrackerSnapshot>),
    });

    renderRoute();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getByText('05:00')).toBeInTheDocument();
  });
});
