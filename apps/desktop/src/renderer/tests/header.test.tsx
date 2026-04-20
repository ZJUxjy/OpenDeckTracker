import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import App from '../src/App';
import { routes } from '../src/routes';

function renderApp() {
  const router = createMemoryRouter(
    [{ path: '/', element: <App />, children: routes }],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('App header three-state status', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows "Game Not Running" in gray when isAlive=false', async () => {
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(false);

    renderApp();
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });

    expect(screen.getByText('Game Not Running')).toBeInTheDocument();
    const monitor = document.querySelector('.text-zinc-500');
    expect(monitor).toBeTruthy();
  });

  it('shows "Not Logged In" in yellow when isAlive=true but no battleTag', async () => {
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(true);
    window.hdt.hearthmirror.getBattleTag = vi.fn().mockResolvedValue(null);
    window.hdt.hearthmirror.getMedalInfo = vi.fn().mockResolvedValue(null);

    renderApp();
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });

    expect(screen.getByText('Not Logged In')).toBeInTheDocument();
    const monitor = document.querySelector('.text-amber-500');
    expect(monitor).toBeTruthy();
  });

  it('shows "Game Running" in green and fullBattleTag when logged in', async () => {
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(true);
    window.hdt.hearthmirror.getBattleTag = vi.fn().mockResolvedValue({ name: 'Player', fullBattleTag: 'Player#1234' });
    window.hdt.hearthmirror.getMedalInfo = vi.fn().mockResolvedValue(null);

    renderApp();
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });

    expect(screen.getByText('Game Running')).toBeInTheDocument();
    expect(screen.getByText('Player#1234')).toBeInTheDocument();
    const monitor = document.querySelector('.text-emerald-500');
    expect(monitor).toBeTruthy();
  });
});
