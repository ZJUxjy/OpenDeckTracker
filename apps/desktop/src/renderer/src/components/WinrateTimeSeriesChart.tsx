import type { ReactElement } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TimeSeriesGranularity, WinrateTimeSeriesPoint } from '@hdt/core';

import { useTranslation } from '../i18n';

const LOW_CONFIDENCE_THRESHOLD = 3;

export interface WinrateTimeSeriesChartProps {
  points: WinrateTimeSeriesPoint[] | null | undefined;
  granularity: TimeSeriesGranularity;
  onGranularityChange: (next: TimeSeriesGranularity) => void;
}

export function WinrateTimeSeriesChart({
  points,
  granularity,
  onGranularityChange,
}: WinrateTimeSeriesChartProps): ReactElement {
  const { t } = useTranslation();

  return (
    <div data-testid="winrate-time-series">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text">{t('stats.timeSeries.title')}</h3>
        <div className="flex space-x-1">
          {(['daily', 'weekly'] as const).map((g) => (
            <button
              key={g}
              onClick={() => onGranularityChange(g)}
              data-testid={`time-series-granularity-${g}`}
              aria-pressed={granularity === g}
              className={`px-2 py-1 text-xs rounded ${
                granularity === g
                  ? 'bg-accent text-text'
                  : 'bg-bg-2 text-text-dim hover:text-text'
              }`}
            >
              {t(`stats.timeSeries.${g}`)}
            </button>
          ))}
        </div>
      </div>
      {points && points.length > 0 ? (
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points.map((p) => ({
                x: new Date(p.bucketStart).toLocaleDateString(),
                winrate: p.winrate ?? 0,
                matches: p.matches,
                lowConfidence: p.matches < LOW_CONFIDENCE_THRESHOLD,
              }))}
              margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="x" stroke="#64748B" axisLine={false} tickLine={false} />
              <YAxis
                stroke="#64748B"
                axisLine={false}
                tickLine={false}
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                cursor={{ fill: 'var(--border)' }}
                contentStyle={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
              />
              <Line type="monotone" dataKey="winrate" stroke="var(--accent)" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div
          className="flex items-center justify-center h-32 text-text-mute text-sm"
          data-testid="winrate-time-series-empty"
        >
          {t('stats.timeSeries.empty')}
        </div>
      )}
    </div>
  );
}
