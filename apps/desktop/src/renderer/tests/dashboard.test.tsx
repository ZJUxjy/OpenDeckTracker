import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import App from '../src/App';
import { routes } from '../src/routes';

function renderDashboard() {
  const router = createMemoryRouter(
    [{ path: '/', element: <App />, children: routes }],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('Dashboard rank display', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows mock fallback rank when medalInfo is null', async () => {
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(false);

    renderDashboard();
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });

    expect(screen.getByText(/Rank:/)).toBeInTheDocument();
    // Should show MOCK_STATS.currentRank as fallback
    expect(screen.getByText(/Legend/)).toBeInTheDocument();
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

    renderDashboard();
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

    renderDashboard();
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });

    expect(screen.getByText(/Legend 42/)).toBeInTheDocument();
  });
});
