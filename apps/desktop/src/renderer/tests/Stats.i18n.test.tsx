import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StatsSummary } from '@hdt/core';
import { Stats } from '../src/components/Stats';
import { I18nProvider } from '../src/i18n';

const emptySummary = (): StatsSummary => ({
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

function mockStatsApi(): void {
  (window as unknown as { hdt: typeof window.hdt }).hdt = {
    ...window.hdt,
    stats: {
      getSummary: vi.fn(async () => emptySummary()),
      listRecent: vi.fn(async () => []),
      getSavedDeckMatchups: vi.fn(async () => []),
      getDeckLadderWinrate: vi.fn(async () => ({
        wins: 0,
        losses: 0,
        matchesPlayed: 0,
        winrate: null,
      })),
    },
  };
}

describe('Stats i18n', () => {
  it('renders format filter labels in en-US', async () => {
    mockStatsApi();

    render(
      <I18nProvider preference="en-US">
        <Stats />
      </I18nProvider>,
    );

    await screen.findByText(/no tracked matches/i);
    const pills = screen.getByTestId('format-filter-pills');
    expect(within(pills).getByText('All Formats')).toBeInTheDocument();
    expect(within(pills).getByText('Standard')).toBeInTheDocument();
    expect(within(pills).getByText('Wild')).toBeInTheDocument();
  });

  it('renders format filter labels in zh-CN', async () => {
    mockStatsApi();

    render(
      <I18nProvider preference="zh-CN">
        <Stats />
      </I18nProvider>,
    );

    await screen.findByText(/暂无已记录对局/);
    const pills = screen.getByTestId('format-filter-pills');
    expect(within(pills).getByText('全部模式')).toBeInTheDocument();
    expect(within(pills).getByText('标准')).toBeInTheDocument();
    expect(within(pills).getByText('狂野')).toBeInTheDocument();
  });

  it('keeps the page header in normal document flow', async () => {
    mockStatsApi();

    render(
      <I18nProvider preference="zh-CN">
        <Stats />
      </I18nProvider>,
    );

    await screen.findByText(/暂无已记录对局/);
    expect(screen.getByTestId('stats-page-header').className).not.toContain('sticky');
  });
});
