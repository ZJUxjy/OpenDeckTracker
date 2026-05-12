import type { ReactNode } from 'react';
import { Activity, Clock, Hand, Layers, Radio, Trophy } from 'lucide-react';
import { useHearthMirrorStatus } from '../hooks/use-hearthmirror-status';
import { useDeckTrackerStore } from '../stores/deck-tracker-store';
import { useHearthWatcherStore } from '../stores/hearthwatcher-store';
import { useTranslation } from '../i18n';
import type { HearthWatcherStatusKind } from '@hdt/hearthwatcher';

function useRankLabel(
  standard: {
    legendRank: number;
    starLevel: number;
  } | null | undefined,
): string {
  const { t } = useTranslation();
  if (!standard) return t('dashboard.rankUnavailable');
  if (standard.legendRank > 0) return t('dashboard.rankLegend', { n: standard.legendRank });
  if (standard.starLevel > 0) return t('dashboard.rankStar', { n: standard.starLevel });
  return t('dashboard.rankUnranked');
}

const WATCHER_COLORS: Record<HearthWatcherStatusKind, string> = {
  ready: 'text-green',
  'waiting-for-lines': 'text-amber',
  'missing-log': 'text-red',
  'parser-error': 'text-red',
  lag: 'text-amber',
  'rotation-or-truncation': 'text-text-dim',
};

export function Dashboard() {
  const { t } = useTranslation();
  const snapshot = useDeckTrackerStore((s) => s.snapshot);
  const { medalInfo } = useHearthMirrorStatus();
  const watcherStatus = useHearthWatcherStore((s) => s.status);
  const deck = snapshot?.deck ?? null;
  const totalOriginal = deck?.original.reduce((sum, card) => sum + card.count, 0) ?? 0;
  const totalRemaining = deck?.remaining.reduce((sum, card) => sum + card.count, 0) ?? 0;
  const phase = snapshot?.phase ?? 'IDLE';
  const rankLabel = useRankLabel(medalInfo?.standard);

  const watcherKindLabel = watcherStatus
    ? t(`dashboard.watcherKind.${watcherStatus.kind}`)
    : t('dashboard.watcherDisconnected');

  return (
    <div className="tavern-dashboard flex-1 flex flex-col overflow-y-auto p-6 gap-4">
      {/* Hero card — Outcast DH or whichever deck is active. Wrapped in
          a Tahoe card so the chromatic rim + dual-shadow gives it the
          Tahoe 26 floating-glass look. */}
      <div className="tahoe-card tavern-hero-card px-7 py-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="bg-accent-translucent text-accent text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-widest">
            {t('dashboard.badge')}
          </span>
          <span className="text-text-tertiary text-xs">{t('dashboard.phase', { phase })}</span>
        </div>
        <h1 className="text-[32px] leading-tight font-black text-text tracking-tight mb-3">
          {deck ? deck.name || t('dashboard.unnamedDeck') : t('dashboard.noActiveDeck')}
        </h1>
        <div className="flex items-center text-text-secondary text-sm gap-5">
          <span className="flex items-center">
            <Trophy size={14} className="mr-1.5 text-amber" />
            {t('dashboard.rank', { rank: rankLabel })}
          </span>
          <span className="flex items-center">
            <Clock size={14} className="mr-1.5 text-text-tertiary" />
            {snapshot ? new Date(snapshot.updatedAt).toLocaleTimeString() : t('dashboard.waitingForGame')}
          </span>
        </div>
      </div>

      {/* 4 stat cards */}
      <div className="tavern-stat-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t('dashboard.cardsLeft')}
          icon={<Layers size={18} className="text-accent" />}
          value={
            <>
              {totalRemaining}
              <span className="text-base text-text-tertiary font-semibold"> / {totalOriginal}</span>
            </>
          }
        />
        <StatCard
          label={t('dashboard.hand')}
          icon={<Hand size={18} className="text-text-tertiary" />}
          value={snapshot?.friendlyHand.length ?? 0}
        />
        <StatCard
          label={t('dashboard.status')}
          icon={<Activity size={18} className={deck ? 'text-green' : 'text-text-tertiary'} />}
          value={
            <span className={deck ? 'text-green' : 'text-text'}>
              {deck ? t('dashboard.statusLive') : t('dashboard.statusIdle')}
            </span>
          }
        />
        <StatCard
          label={t('dashboard.watcher')}
          icon={
            <Radio
              size={18}
              className={watcherStatus ? WATCHER_COLORS[watcherStatus.kind] ?? 'text-text-tertiary' : 'text-text-tertiary'}
            />
          }
          value={
            <span
              className={`text-sm ${watcherStatus ? WATCHER_COLORS[watcherStatus.kind] ?? 'text-text-tertiary' : 'text-text-tertiary'}`}
            >
              {watcherKindLabel}
            </span>
          }
        />
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  icon: ReactNode;
  value: ReactNode;
}

function StatCard({ label, icon, value }: StatCardProps) {
  return (
    <div className="tahoe-card tavern-stat-card p-5 kpi-card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider">
          {label}
        </span>
        {icon}
      </div>
      <div className="text-3xl font-black text-text font-mono tabular-nums">
        {value}
      </div>
    </div>
  );
}
