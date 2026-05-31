import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Swords, Trophy, Clock, Target, Film } from 'lucide-react';
import type {
  DeckSummary,
  FormatFilter,
  MatchHistoryRecord,
  MatchModeFilter,
  MatchRecordingSummary,
  SavedDeckMatchupStats,
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
const MATCH_MODE_FILTERS: MatchModeFilter[] = ['all', 'ranked', 'casual', 'adventure'];
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
  const [matchModeFilter, setMatchModeFilter] = useState<MatchModeFilter>('all');
  const [granularity, setGranularity] = useState<TimeSeriesGranularity>('daily');
  const [summary, setSummary] = useState<StatsSummary>(emptySummary);
  const [recentMatches, setRecentMatches] = useState<MatchHistoryRecord[]>([]);
  const [recordings, setRecordings] = useState<MatchRecordingSummary[]>([]);
  const [viewerRecordingId, setViewerRecordingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedDecks, setSavedDecks] = useState<DeckSummary[]>([]);
  const [selectedSavedDeckId, setSelectedSavedDeckId] = useState<string | null>(null);
  const [deckMatchups, setDeckMatchups] = useState<SavedDeckMatchupStats[]>([]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void Promise.all([
      window.hdt.stats.getSummary(timeFilter, {
        formatFilter,
        matchModeFilter,
        includeMatchupMatrix: true,
        includeTimeSeries: true,
        includePlayOrderSplit: true,
        timeSeriesGranularity: granularity,
      }),
      window.hdt.stats.listRecent(timeFilter, 5, { formatFilter, matchModeFilter }),
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
  }, [timeFilter, formatFilter, matchModeFilter, granularity]);

  useEffect(() => {
    let cancelled = false;
    void window.hdt.decks
      .list()
      .then((decks) => {
        if (cancelled) return;
        const sorted = [...decks].sort((a, b) => a.name.localeCompare(b.name));
        setSavedDecks(sorted);
        setSelectedSavedDeckId((prev) => {
          if (prev !== null && sorted.some((d) => d.id === prev)) return prev;
          return sorted[0]?.id ?? null;
        });
      })
      .catch(() => {
        if (!cancelled) setSavedDecks([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedSavedDeckId === null) {
      setDeckMatchups([]);
      return;
    }
    let cancelled = false;
    void window.hdt.stats
      .getSavedDeckMatchups(selectedSavedDeckId, timeFilter, {
        formatFilter,
        matchModeFilter,
      })
      .then((rows) => {
        if (!cancelled) setDeckMatchups(rows);
      })
      .catch(() => {
        if (!cancelled) setDeckMatchups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSavedDeckId, timeFilter, formatFilter, matchModeFilter]);

  const recordingByFingerprint = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of recordings) {
      if (r.matchFingerprint !== undefined) m.set(r.matchFingerprint, r.recordingId);
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
    <div className="reference-page reference-stats flex-1 h-full min-h-0 overflow-y-auto">
      <div className="reference-stats-content space-y-5 w-full">
        {/* Header */}
        <div
          className="flex flex-wrap items-start justify-between gap-4"
          data-testid="stats-page-header"
        >
          <div>
            <h1 className="text-2xl font-bold text-text mb-1">{t('stats.title')}</h1>
            <p className="text-text-secondary text-sm">{t('stats.subtitle')}</p>
          </div>

          <div className="flex flex-col items-end space-y-2">
            <div className="flex bg-overlay-surface dark:bg-black/20 rounded-md p-1 border border-border-hairline">
              {FILTERS.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setTimeFilter(filter)}
                  className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${
                    timeFilter === filter
                      ? 'bg-accent text-text-on-accent shadow-[0_1px_3px_rgba(0,0,0,0.18)]'
                      : 'text-text-secondary hover:text-text'
                  }`}
                >
                  {t(`stats.timeFilter.${filter}`)}
                </button>
              ))}
            </div>
            <FormatFilterPills value={formatFilter} onChange={setFormatFilter} />
            <div
              className="flex flex-wrap justify-end gap-2"
              data-testid="match-mode-filter-pills"
            >
              {MATCH_MODE_FILTERS.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={matchModeFilter === mode}
                  onClick={() => setMatchModeFilter(mode)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    matchModeFilter === mode
                      ? 'bg-accent text-bg'
                      : 'bg-overlay-surface text-text-dim hover:text-text hover:bg-overlay-hover'
                  }`}
                >
                  {t(`stats.matchModeFilter.${mode}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="kpi-card tahoe-card p-5 flex flex-col relative overflow-hidden group">
            <div className="absolute right-[-10px] top-[-10px] opacity-5 text-accent group-hover:opacity-10 transition-opacity">
              <Trophy size={100} />
            </div>
            <span className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-2">{t('stats.kpi.overallWinrate')}</span>
            <div className="text-3xl font-black font-mono tabular-nums text-text">{formatPercent(summary.overallWinrate)}</div>
            <div className="text-sm mt-2 text-text-tertiary font-mono tabular-nums">
              {t('stats.kpi.winsLosses', { wins: summary.wins, losses: summary.losses })}
            </div>
          </div>

          <div className="kpi-card tahoe-card p-5 flex flex-col relative overflow-hidden group">
            <div className="absolute right-[-10px] top-[-10px] opacity-5 text-text-tertiary group-hover:opacity-10 transition-opacity">
              <Swords size={100} />
            </div>
            <span className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-2">{t('stats.kpi.matchesPlayed')}</span>
            <div className="text-3xl font-black font-mono tabular-nums text-text">{summary.matchesPlayed.toLocaleString()}</div>
            <div className="text-sm mt-2 text-text-tertiary">{t('stats.kpi.matchesPlayedSubtitle')}</div>
          </div>

          <div className="kpi-card tahoe-card p-5 flex flex-col relative overflow-hidden group">
            <div className="absolute right-[-10px] top-[-10px] opacity-5 text-text-tertiary group-hover:opacity-10 transition-opacity">
              <Clock size={100} />
            </div>
            <span className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-2">{t('stats.kpi.timePlayed')}</span>
            <div className="text-3xl font-black font-mono tabular-nums text-text">{formatTimePlayed(summary.timePlayedSeconds)}</div>
            <div className="text-sm mt-2 text-text-tertiary font-mono tabular-nums">
              {summary.averageDurationSeconds === null
                ? t('stats.kpi.noAverage')
                : t('stats.kpi.averageDuration', { duration: formatDuration(summary.averageDurationSeconds) })}
            </div>
          </div>

          <div className="kpi-card tahoe-card p-5 flex flex-col relative overflow-hidden group">
            <div className="absolute right-[-10px] top-[-10px] opacity-5 text-red group-hover:opacity-10 transition-opacity">
              <Target size={100} />
            </div>
            <span className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider mb-2">{t('stats.kpi.bestDeck')}</span>
            <div className="text-xl font-bold text-accent truncate mt-1">
              {summary.bestDeck?.deckName ?? t('stats.kpi.bestDeckEmpty')}
            </div>
            <div className="text-sm mt-2 text-text-tertiary font-mono tabular-nums">
              {summary.bestDeck === null
                ? t('stats.kpi.bestDeckPlaceholder')
                : t('stats.kpi.bestDeckLine', {
                    percent: formatPercent(summary.bestDeck.winrate),
                    wins: summary.bestDeck.wins,
                    losses: summary.bestDeck.losses,
                  })}
            </div>
          </div>
        </div>

        {/* Winrate Time Series + Play/Coin Split */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 tahoe-card p-5">
            <WinrateTimeSeriesChart
              points={summary.winrateTimeSeries ?? null}
              granularity={granularity}
              onGranularityChange={setGranularity}
            />
          </div>
          <div className="tahoe-card p-5">
            <PlayOrderSplitCard split={summary.playOrderSplit ?? null} />
          </div>
        </div>

        {/* Matchup Matrix */}
        <div className="tahoe-card p-5">
          <h2 className="text-lg font-bold text-text mb-4">{t('stats.matchup.title')}</h2>
          <MatchupMatrix matrix={summary.matchupMatrix ?? null} />
        </div>

        {/* Saved Deck Matchups */}
        <div className="tahoe-card p-5" data-testid="deck-matchup-card">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-text">{t('stats.deckMatchup.title')}</h2>
            {savedDecks.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <span>{t('stats.deckMatchup.deckLabel')}</span>
                <select
                  data-testid="deck-matchup-select"
                  className="bg-overlay-surface dark:bg-black/20 border border-border-hairline rounded px-2 py-1 text-text text-sm"
                  value={selectedSavedDeckId ?? ''}
                  onChange={(e) => setSelectedSavedDeckId(e.target.value || null)}
                >
                  {savedDecks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {savedDecks.length === 0 ? (
            <div className="text-text-mute text-sm py-6 text-center">
              {t('stats.deckMatchup.noDecks')}
            </div>
          ) : deckMatchups.length === 0 ? (
            <div className="text-text-mute text-sm py-6 text-center">
              {t('stats.deckMatchup.empty')}
            </div>
          ) : (
            <table className="w-full text-sm" data-testid="deck-matchup-table">
              <thead>
                <tr className="text-text-tertiary text-[11px] uppercase tracking-wider">
                  <th className="text-left font-semibold pb-2">{t('stats.deckMatchup.headerOpponent')}</th>
                  <th className="text-right font-semibold pb-2">{t('stats.deckMatchup.headerRecord')}</th>
                  <th className="text-right font-semibold pb-2">{t('stats.deckMatchup.headerWinrate')}</th>
                </tr>
              </thead>
              <tbody>
                {deckMatchups.map((row) => (
                  <tr key={row.opponentClass} className="border-t border-border-hairline">
                    <td className="py-2 text-text">{row.opponentClass}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-text">
                      {row.wins}-{row.losses}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-text">
                      {row.winrate === null ? '—' : `${row.winrate}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

          {/* Class Winrate Chart */}
          <div className="xl:col-span-2 tahoe-card p-5">
            <h2 className="text-lg font-bold text-text mb-6 flex items-center">
              {t('stats.classChart.title')}
            </h2>
            <div className="h-[300px] w-full">
              {classChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-text-mute text-sm">
                  {t('stats.classChart.empty')}
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
                    <Bar dataKey="wins" name={t('stats.classChart.wins')} stackId="a" fill="#10B981" radius={[0, 0, 4, 4]} />
                    <Bar dataKey="losses" name={t('stats.classChart.losses')} stackId="a" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Recent Matches */}
          <div className="tahoe-card p-5 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-text">{t('stats.recent.title')}</h2>
              <button className="text-accent text-sm font-medium hover:text-accent">{t('stats.recent.viewAll')}</button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-border">
              {isLoading ? (
                <div className="text-text-mute text-sm py-8 text-center">{t('stats.recent.loading')}</div>
              ) : error !== null ? (
                <div className="text-red text-sm py-8 text-center">{error}</div>
              ) : recentMatches.length === 0 ? (
                <div className="text-text-mute text-sm py-8 text-center">
                  {t('stats.recent.empty')}
                </div>
              ) : (
                recentMatches.map((match) => {
                  const recordingId = recordingByFingerprint.has(match.fingerprint)
                    ? match.fingerprint
                    : null;
                  return (
                    <div
                      key={match.id}
                      className="recent-match-row bg-white/40 dark:bg-black/30 rounded-lg p-3 border border-border-hairline hover:border-border-strong transition-colors flex flex-col"
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
                                : 'bg-overlay-surface text-text'
                          }`}
                        >
                          {t(`stats.result.${match.result}`)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-text font-medium text-sm">
                            {match.deckName ?? t('stats.recent.unknownDeck')}
                          </span>
                          <span className="text-text-mute text-xs mt-0.5">
                            {t('stats.recent.vsOpponent', {
                              opponent:
                                match.opponentClass ??
                                match.opponentName ??
                                t('stats.recent.unknownOpponent'),
                            })}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-text text-sm font-medium font-mono tabular-nums">
                            {formatDuration(match.durationSeconds)}
                          </span>
                          <div className="text-xs text-text-mute mt-0.5">
                            {t(`stats.playOrderShort.${match.playOrder}`)}
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

function formatRelativeDate(endedAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(endedAt));
}
