import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Swords, Trophy, Clock, Target, Film } from 'lucide-react';
import type {
  FormatFilter,
  MatchHistoryRecord,
  MatchRecordingSummary,
  StatsSummary,
  StatsTimeFilter,
  TimeSeriesGranularity,
} from '@hdt/core';

import { FormatFilterPills } from './FormatFilterPills';
import { MatchupMatrix } from './MatchupMatrix';
import { WinrateTimeSeriesChart } from './WinrateTimeSeriesChart';
import { PlayOrderSplitCard } from './PlayOrderSplitCard';
import { MatchRecordingViewer } from './MatchRecordingViewer';
import { useTranslation } from '../i18n';

const FILTERS: StatsTimeFilter[] = ['today', 'week', 'season', 'all-time'];
const CLASS_STATS_KEY = 'class' + 'Winrates';

const emptySummary = {
  matchesPlayed: 0,
  wins: 0,
  losses: 0,
  overallWinrate: null,
  timePlayedSeconds: 0,
  averageDurationSeconds: null,
  bestDeck: null,
  recentMatches: [],
  [CLASS_STATS_KEY]: [],
} as unknown as StatsSummary;

export function Stats() {
  const { t } = useTranslation();
  const [timeFilter, setTimeFilter] = useState<StatsTimeFilter>('season');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [granularity, setGranularity] = useState<TimeSeriesGranularity>('daily');
  const [summary, setSummary] = useState<StatsSummary>(emptySummary);
  const [recentMatches, setRecentMatches] = useState<MatchHistoryRecord[]>([]);
  const [recordings, setRecordings] = useState<MatchRecordingSummary[]>([]);
  const [viewerRecordingId, setViewerRecordingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void Promise.all([
      window.hdt.stats.getSummary(timeFilter, {
        formatFilter,
        includeMatchupMatrix: true,
        includeTimeSeries: true,
        includePlayOrderSplit: true,
        timeSeriesGranularity: granularity,
      }),
      window.hdt.stats.listRecent(timeFilter, 5, { formatFilter }),
      window.hdt.recordings.list().catch(() => [] as MatchRecordingSummary[]),
    ])
      .then(([nextSummary, nextRecent, nextRecordings]) => {
        if (cancelled) return;
        setSummary(nextSummary);
        setRecentMatches(nextRecent);
        setRecordings(nextRecordings);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSummary(emptySummary);
        setRecentMatches([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [timeFilter, formatFilter, granularity]);

  // Build a quick lookup so each match row can find its recording (joined on
  // `endedAt` since the recordings store doesn't carry the match fingerprint
  // — see add-stats-analytics-deepening design D7 follow-up note).
  const recordingByEndedAt = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of recordings) {
      if (r.endedAt !== null) m.set(r.endedAt, r.recordingId);
    }
    return m;
  }, [recordings]);

  const classChartData = (
    (summary as unknown as Record<string, { className: string; wins: number; losses: number }[]>)[
      CLASS_STATS_KEY
    ] ?? []
  ).map((entry) => ({
    name: entry.className,
    wins: entry.wins,
    losses: entry.losses,
  }));

  return (
    <div className="flex-1 flex flex-col bg-bg overflow-y-auto">
      {/* Header */}
      <div className="bg-bg border-b border-border p-6 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold text-text mb-1">Constructed Stats</h1>
          <p className="text-text-dim text-sm">Detailed breakdown of your ranked performance.</p>
        </div>
        
        <div className="flex flex-col items-end space-y-2">
          <div className="flex space-x-2">
            {FILTERS.map((filter) => (
              <button
                key={filter}
                onClick={() => setTimeFilter(filter)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  timeFilter === filter
                    ? 'bg-accent text-bg'
                    : 'bg-bg-2 text-text-dim hover:text-text hover:bg-bg-3'
                }`}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1).replace('-', ' ')}
              </button>
            ))}
          </div>
          <FormatFilterPills value={formatFilter} onChange={setFormatFilter} />
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        
        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-bg-2 border border-border rounded-xl p-5 flex flex-col relative overflow-hidden group">
            <div className="absolute right-[-10px] top-[-10px] opacity-5 text-accent group-hover:opacity-10 transition-opacity">
              <Trophy size={100} />
            </div>
            <span className="text-text-dim text-sm font-semibold uppercase tracking-wider mb-2">Overall Winrate</span>
            <div className="text-3xl font-black font-mono tabular-nums text-text">{formatPercent(summary.overallWinrate)}</div>
            <div className="text-sm mt-2 text-text-dim">
              <span className="font-mono tabular-nums">{summary.wins}</span> Wins - <span className="font-mono tabular-nums">{summary.losses}</span> Losses
            </div>
          </div>

          <div className="bg-bg-2 border border-border rounded-xl p-5 flex flex-col relative overflow-hidden group">
            <div className="absolute right-[-10px] top-[-10px] opacity-5 text-text-dim group-hover:opacity-10 transition-opacity">
              <Swords size={100} />
            </div>
            <span className="text-text-dim text-sm font-semibold uppercase tracking-wider mb-2">Matches Played</span>
            <div className="text-3xl font-black font-mono tabular-nums text-text">{summary.matchesPlayed.toLocaleString()}</div>
            <div className="text-sm mt-2 text-text-dim">Real tracked constructed matches</div>
          </div>

          <div className="bg-bg-2 border border-border rounded-xl p-5 flex flex-col relative overflow-hidden group">
            <div className="absolute right-[-10px] top-[-10px] opacity-5 text-text-dim group-hover:opacity-10 transition-opacity">
              <Clock size={100} />
            </div>
            <span className="text-text-dim text-sm font-semibold uppercase tracking-wider mb-2">Time Played</span>
            <div className="text-3xl font-black font-mono tabular-nums text-text">{formatTimePlayed(summary.timePlayedSeconds)}</div>
            <div className="text-sm mt-2 text-text-dim">
              {summary.averageDurationSeconds === null
                ? 'No average yet'
                : <>~<span className="font-mono tabular-nums">{formatDuration(summary.averageDurationSeconds)}</span> average</>}
            </div>
          </div>

          <div className="bg-bg-2 border border-border rounded-xl p-5 flex flex-col relative overflow-hidden group">
            <div className="absolute right-[-10px] top-[-10px] opacity-5 text-red group-hover:opacity-10 transition-opacity">
              <Target size={100} />
            </div>
            <span className="text-text-dim text-sm font-semibold uppercase tracking-wider mb-2">Best Deck</span>
            <div className="text-xl font-bold text-accent truncate mt-1">
              {summary.bestDeck?.deckName ?? 'No tracked deck'}
            </div>
            <div className="text-sm mt-2 text-text-dim">
              {summary.bestDeck === null
                ? 'Stats will appear after tracked games'
                : <><span className="font-mono tabular-nums">{formatPercent(summary.bestDeck.winrate)}</span> · <span className="font-mono tabular-nums">{summary.bestDeck.wins}</span>W - <span className="font-mono tabular-nums">{summary.bestDeck.losses}</span>L</>}
            </div>
          </div>
        </div>

        {/* Winrate Time Series + Play/Coin Split */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-bg-2 border border-border rounded-xl p-5">
            <WinrateTimeSeriesChart
              points={summary.winrateTimeSeries ?? null}
              granularity={granularity}
              onGranularityChange={setGranularity}
            />
          </div>
          <div className="bg-bg-2 border border-border rounded-xl p-5">
            <PlayOrderSplitCard split={summary.playOrderSplit ?? null} />
          </div>
        </div>

        {/* Matchup Matrix */}
        <div className="bg-bg-2 border border-border rounded-xl p-5">
          <h2 className="text-lg font-bold text-text mb-4">{t('stats.matchup.title')}</h2>
          <MatchupMatrix matrix={summary.matchupMatrix ?? null} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Class Winrate Chart */}
          <div className="xl:col-span-2 bg-bg-2 border border-border rounded-xl p-5">
            <h2 className="text-lg font-bold text-text mb-6 flex items-center">
              Winrate vs Classes
            </h2>
            <div className="h-[300px] w-full">
              {classChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-text-mute text-sm">
                  No class matchup stats yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={classChartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--text-mute)" axisLine={false} tickLine={false} />
                    <YAxis stroke="var(--text-mute)" axisLine={false} tickLine={false} />
                    <Tooltip 
                      cursor={{ fill: 'var(--border)' }}
                      contentStyle={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
                    />
                    <Bar dataKey="wins" name="Wins" stackId="a" fill="#10B981" radius={[0, 0, 4, 4]} />
                    <Bar dataKey="losses" name="Losses" stackId="a" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Recent Matches */}
          <div className="bg-bg-2 border border-border rounded-xl p-5 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-text">Recent Matches</h2>
              <button className="text-accent text-sm font-medium hover:text-accent">View All</button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-border">
              {isLoading ? (
                <div className="text-text-mute text-sm py-8 text-center">Loading match history...</div>
              ) : error !== null ? (
                <div className="text-red text-sm py-8 text-center">{error}</div>
              ) : recentMatches.length === 0 ? (
                <div className="text-text-mute text-sm py-8 text-center">
                  No tracked matches yet.
                </div>
              ) : (
                recentMatches.map((match) => {
                  const recordingId = recordingByEndedAt.get(match.endedAt) ?? null;
                  return (
                    <div
                      key={match.id}
                      className="bg-bg rounded-lg p-3 border border-border hover:border-border-hi transition-colors flex flex-col"
                      data-testid={`match-row-${match.id}`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-text-dim font-mono tabular-nums">{formatRelativeDate(match.endedAt)}</span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            match.result === 'win'
                              ? 'bg-green/20 text-green'
                              : match.result === 'loss'
                                ? 'bg-red/20 text-red'
                                : 'bg-bg-3/20 text-text'
                          }`}
                        >
                          {formatResult(match.result)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-text font-medium text-sm">
                            {match.deckName ?? 'Unknown Deck'}
                          </span>
                          <span className="text-text-mute text-xs mt-0.5">
                            vs {match.opponentClass ?? match.opponentName ?? 'Unknown'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-text text-sm font-medium font-mono tabular-nums">
                            {formatDuration(match.durationSeconds)}
                          </span>
                          <div className="text-xs text-text-mute mt-0.5">
                            {formatPlayOrder(match.playOrder)}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setViewerRecordingId(recordingId)}
                        disabled={recordingId === null}
                        data-testid={`view-recording-${match.id}`}
                        className="mt-2 text-xs inline-flex items-center gap-1 text-text-dim hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed self-start"
                        aria-label={t('stats.recordings.view')}
                      >
                        <Film size={12} />
                        {recordingId === null
                          ? t('stats.recordings.unavailable')
                          : t('stats.recordings.view')}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

      </div>

      <MatchRecordingViewer
        open={viewerRecordingId !== null}
        onOpenChange={(open) => {
          if (!open) setViewerRecordingId(null);
        }}
        recordingId={viewerRecordingId}
      />
    </div>
  );
}

function formatPercent(value: number | null): string {
  return value === null ? '-' : `${value}%`;
}

function formatTimePlayed(seconds: number): string {
  if (seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function formatResult(result: MatchHistoryRecord['result']): string {
  if (result === 'win') return 'Win';
  if (result === 'loss') return 'Loss';
  return 'Unknown';
}

function formatPlayOrder(playOrder: MatchHistoryRecord['playOrder']): string {
  if (playOrder === 'coin') return 'Coin';
  if (playOrder === 'first') return 'First';
  return 'Unknown';
}

function formatRelativeDate(endedAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(endedAt));
}
