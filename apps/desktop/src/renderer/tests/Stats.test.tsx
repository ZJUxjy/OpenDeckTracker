import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  DeckSummary,
  MatchHistoryRecord,
  SavedDeckMatchupStats,
  StatsSummary,
} from '@hdt/core';
import { Stats } from '../src/components/Stats';

const emptyStatsSummary = (): StatsSummary => ({
  matchesPlayed: 0,
  wins: 0,
  losses: 0,
  overallWinrate: null,
  timePlayedSeconds: 0,
  averageDurationSeconds: null,
  bestDeck: null,
  classWinrates: [],
  recentMatches: [],
});

const recentWin = (): MatchHistoryRecord => ({
  id: 1,
  fingerprint: 'real-match',
  startedAt: Date.parse('2026-04-27T10:00:00Z'),
  endedAt: Date.parse('2026-04-27T10:10:00Z'),
  durationSeconds: 600,
  result: 'win',
  playOrder: 'coin',
  deckId: 42,
  deckName: 'Recorded Real Deck',
  opponentName: 'Opponent',
  opponentClass: 'Mage',
  gameType: 3,
  formatType: 2,
  source: 'deck-tracker',
});

function mockStatsApi(args: {
  summary: StatsSummary;
  recent: MatchHistoryRecord[];
  decks?: DeckSummary[];
  matchups?: SavedDeckMatchupStats[];
  getSavedDeckMatchups?: ReturnType<typeof vi.fn>;
}): void {
  (window as unknown as { hdt: typeof window.hdt }).hdt = {
    ...window.hdt,
    stats: {
      getSummary: vi.fn(async () => args.summary),
      listRecent: vi.fn(async () => args.recent),
      getSavedDeckMatchups:
        args.getSavedDeckMatchups ?? vi.fn(async () => args.matchups ?? []),
    },
    decks: {
      ...window.hdt.decks,
      list: vi.fn(async () => args.decks ?? []),
    },
  };
}

describe('Stats', () => {
  it('shows empty states instead of mock matches when history is empty', async () => {
    mockStatsApi({ summary: emptyStatsSummary(), recent: [] });

    render(<Stats />);

    expect(await screen.findByText(/no tracked matches/i)).toBeInTheDocument();
    expect(screen.queryByText('Frost Mage')).not.toBeInTheDocument();
    expect(screen.queryByText('1,245')).not.toBeInTheDocument();
    expect(screen.queryByText('58.4%')).not.toBeInTheDocument();
  });

  it('renders recent matches returned by the stats API', async () => {
    mockStatsApi({
      summary: {
        ...emptyStatsSummary(),
        matchesPlayed: 1,
        wins: 1,
        overallWinrate: 100,
        timePlayedSeconds: 600,
        averageDurationSeconds: 600,
        bestDeck: {
          deckId: 42,
          deckName: 'Recorded Real Deck',
          wins: 1,
          losses: 0,
          matchesPlayed: 1,
          winrate: 100,
        },
        classWinrates: [{ className: 'Mage', wins: 1, losses: 0, winrate: 100 }],
        recentMatches: [recentWin()],
      },
      recent: [recentWin()],
    });

    render(<Stats />);

    expect(await screen.findAllByText('Recorded Real Deck')).toHaveLength(2);
    expect(screen.getByText(/vs Mage/i)).toBeInTheDocument();
    // "100%" appears in both the Overall Winrate KPI and the Best Deck card
    // after Section 6 wraps each numeric in its own font-mono span; assert
    // at least one match instead of pinning to a single occurrence.
    expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(1);
  });

  it('renders saved deck matchup rows when a deck is selected', async () => {
    const decks: DeckSummary[] = [
      {
        id: 'deck-a',
        name: 'Ramp Druid',
        class: 'DRUID',
        format: 'Standard',
        version: 1,
        cardCount: 30,
        updatedAt: 0,
      },
    ];
    const getSavedDeckMatchups = vi.fn(async (): Promise<SavedDeckMatchupStats[]> => [
      { opponentClass: 'MAGE', wins: 1, losses: 1, matchesPlayed: 2, winrate: 50 },
    ]);
    mockStatsApi({
      summary: emptyStatsSummary(),
      recent: [],
      decks,
      getSavedDeckMatchups,
    });

    render(<Stats />);

    const table = await screen.findByTestId('deck-matchup-table');
    expect(table).toHaveTextContent('MAGE');
    expect(table).toHaveTextContent('1-1');
    expect(table).toHaveTextContent('50%');
    expect(getSavedDeckMatchups).toHaveBeenCalledWith(
      'deck-a',
      expect.any(String),
      expect.any(Object),
    );
  });

  it('shows empty deck matchup state when the selected deck has no rows', async () => {
    const decks: DeckSummary[] = [
      {
        id: 'deck-a',
        name: 'Ramp Druid',
        class: 'DRUID',
        format: 'Standard',
        version: 1,
        cardCount: 30,
        updatedAt: 0,
      },
    ];
    mockStatsApi({
      summary: emptyStatsSummary(),
      recent: [],
      decks,
      matchups: [],
    });

    render(<Stats />);

    expect(await screen.findByText(/no matches yet for this deck/i)).toBeInTheDocument();
  });

  it('shows no-decks state when the deck store is empty', async () => {
    mockStatsApi({ summary: emptyStatsSummary(), recent: [], decks: [] });

    render(<Stats />);

    expect(await screen.findByText(/save a deck to see its matchups/i)).toBeInTheDocument();
  });
});
