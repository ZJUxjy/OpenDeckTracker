import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { WinrateTimeSeriesPoint } from '@hdt/core';

import { WinrateTimeSeriesChart } from '../src/components/WinrateTimeSeriesChart';
import { I18nProvider } from '../src/i18n';

function renderChart(props: {
  points: WinrateTimeSeriesPoint[] | null;
  granularity?: 'daily' | 'weekly';
  onGranularityChange?: (g: 'daily' | 'weekly') => void;
}) {
  return render(
    <I18nProvider preference="en-US">
      <WinrateTimeSeriesChart
        points={props.points}
        granularity={props.granularity ?? 'daily'}
        onGranularityChange={props.onGranularityChange ?? (() => undefined)}
      />
    </I18nProvider>,
  );
}

describe('WinrateTimeSeriesChart', () => {
  it('renders empty placeholder for null points', () => {
    renderChart({ points: null });
    expect(screen.getByTestId('winrate-time-series-empty')).toBeInTheDocument();
  });

  it('renders empty placeholder for empty array', () => {
    renderChart({ points: [] });
    expect(screen.getByTestId('winrate-time-series-empty')).toBeInTheDocument();
  });

  it('renders the chart container when given non-empty data', () => {
    const points: WinrateTimeSeriesPoint[] = [
      { bucketStart: Date.parse('2026-04-29T00:00:00Z'), wins: 3, losses: 1, winrate: 75, matches: 4 },
    ];
    renderChart({ points });
    expect(screen.queryByTestId('winrate-time-series-empty')).toBeNull();
    expect(screen.getByTestId('winrate-time-series')).toBeInTheDocument();
  });

  it('granularity toggle calls onGranularityChange', () => {
    const onChange = vi.fn();
    renderChart({ points: [], granularity: 'daily', onGranularityChange: onChange });
    fireEvent.click(screen.getByTestId('time-series-granularity-weekly'));
    expect(onChange).toHaveBeenCalledWith('weekly');
  });

  it('reflects active granularity via aria-pressed', () => {
    renderChart({ points: [], granularity: 'weekly' });
    expect(
      screen.getByTestId('time-series-granularity-weekly').getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByTestId('time-series-granularity-daily').getAttribute('aria-pressed'),
    ).toBe('false');
  });
});
