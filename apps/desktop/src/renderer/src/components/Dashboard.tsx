import type { ReactNode } from 'react';
import { Activity, Clock, Hand, Layers, Radio, Trophy } from 'lucide-react';
import { useHearthMirrorStatus } from '../hooks/use-hearthmirror-status';
import { useDeckTrackerStore } from '../stores/deck-tracker-store';
import { useHearthWatcherStore } from '../stores/hearthwatcher-store';
import { useTranslation } from '../i18n';
import { useCardDef } from '../hooks/use-card-def';
import type { HearthWatcherStatusKind } from '@hdt/hearthwatcher';

function useRankLabel(
  standard:
    | {
        legendRank: number;
        starLevel: number;
      }
    | null
    | undefined,
): string {
  const { t } = useTranslation();
  if (!standard) return t('dashboard.rankUnavailable');
  if (standard.legendRank > 0) return t('dashboard.rankLegend', { n: standard.legendRank });
  if (standard.starLevel > 0) return t('dashboard.rankStar', { n: standard.starLevel });
  return t('dashboard.rankUnranked');
}

type StatTone = 'deck' | 'hand' | 'live' | 'idle' | 'warning' | 'danger' | 'success';

function getWatcherTone(kind: HearthWatcherStatusKind | null | undefined): StatTone {
  if (!kind) return 'warning';
  if (kind === 'ready') return 'success';
  if (kind === 'missing-log' || kind === 'parser-error') return 'danger';
  if (kind === 'rotation-or-truncation') return 'idle';
  return 'warning';
}

export function Dashboard() {
  const { t } = useTranslation();
  const snapshot = useDeckTrackerStore((s) => s.snapshot);
  const { medalInfo, isAlive } = useHearthMirrorStatus();
  const watcherStatus = useHearthWatcherStore((s) => s.status);
  const deck = snapshot?.deck ?? null;
  const totalOriginal = deck?.original.reduce((sum, card) => sum + card.count, 0) ?? 0;
  const totalRemaining = deck?.remaining.reduce((sum, card) => sum + card.count, 0) ?? 0;
  const phase = snapshot?.phase ?? 'IDLE';
  const phaseLabel = t(`dashboard.phaseKind.${phase}`);
  const connectionTitle = !isAlive
    ? t('deckTracker.hearthstoneNotRunning')
    : phase === 'IN_MATCH'
      ? t('onboarding.bannerInMatchTitle')
      : t('onboarding.bannerWaitingTitle');
  const connectionHint = !isAlive
    ? t('deckTracker.hearthstoneNotRunningHint')
    : phase === 'IN_MATCH'
      ? t('deckTracker.live')
      : t('onboarding.bannerWaitingBody');
  const rankLabel = useRankLabel(medalInfo?.standard);

  const watcherKindLabel = watcherStatus
    ? t(`dashboard.watcherKind.${watcherStatus.kind}`)
    : t('dashboard.watcherDisconnected');

  return (
    <div className="tavern-dashboard flex-1 overflow-y-auto p-6">
      <div className="fallout-dashboard-grid">
        <aside className="tahoe-card fallout-connection-panel p-6">
          <div className="fallout-vault-mark mx-auto mb-8 flex h-12 w-12 items-center justify-center rounded-lg">
            76
          </div>
          <h2 className="text-center text-2xl font-black text-green">
            {connectionTitle}
          </h2>
          <p className="mt-2 text-center text-sm text-green">
            {connectionHint}
          </p>
          <div className="mt-10 space-y-4 text-sm text-green">
            <StatusLine label={t('dashboard.watcher')} value={watcherKindLabel} />
            <StatusLine
              label={t('deckTracker.deck')}
              value={deck ? t('dashboard.statusLive') : t('dashboard.statusIdle')}
            />
            <StatusLine
              label={t('dashboard.hand')}
              value={String(snapshot?.friendlyHand.length ?? 0)}
            />
            <StatusLine label={t('fallout.statusBar.database')} value="OK" />
          </div>
        </aside>

        <section className="fallout-dashboard-main min-w-0 space-y-4">
          <div className="fallout-page-heading">
            <h1 className="text-3xl font-black text-green">
              01 {t('sidebar.deckTracker')} / Dashboard
            </h1>
            <p className="mt-1 text-sm text-text-dim">{t('onboarding.bannerHsNotRunningBody')}</p>
          </div>

          <div className="tahoe-card tavern-hero-card px-7 py-6">
            <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
              <span className="text-base font-bold text-amber">
                {t('fallout.dashboard.liveBadge')}
              </span>
              <span className="text-xs text-text-mute">
                {t('dashboard.phase', { phase: phaseLabel })}
              </span>
            </div>
            <h2 className="text-[32px] leading-tight font-black text-text tracking-tight mb-3">
              {deck ? deck.name || t('dashboard.unnamedDeck') : t('dashboard.noActiveDeck')}
            </h2>
            <div className="flex flex-wrap items-center text-text-secondary text-sm gap-5">
              <span className="flex items-center">
                <Trophy size={14} className="mr-1.5 text-amber" />
                {t('dashboard.rank', { rank: rankLabel })}
              </span>
              <span className="flex items-center">
                <Clock size={14} className="mr-1.5 text-text-tertiary" />
                {snapshot
                  ? new Date(snapshot.updatedAt).toLocaleTimeString()
                  : t('dashboard.waitingForGame')}
              </span>
            </div>
          </div>

          <div className="tavern-stat-grid dashboard-stat-grid" data-testid="dashboard-stat-grid">
            <StatCard
              tone="deck"
              label={t('dashboard.cardsLeft')}
              icon={<Layers size={20} />}
              value={
                <>
                  {totalRemaining}
                  <span className="dashboard-stat-total"> / {totalOriginal}</span>
                </>
              }
            />
            <StatCard
              tone="hand"
              label={t('dashboard.hand')}
              icon={<Hand size={20} />}
              value={snapshot?.friendlyHand.length ?? 0}
            />
            <StatCard
              tone={deck ? 'live' : 'idle'}
              label={t('dashboard.status')}
              icon={<Activity size={20} />}
              value={deck ? t('dashboard.statusLive') : t('dashboard.statusIdle')}
            />
            <StatCard
              tone={getWatcherTone(watcherStatus?.kind)}
              label={t('dashboard.watcher')}
              icon={<Radio size={20} />}
              value={watcherKindLabel}
              compact
            />
          </div>
        </section>

        <aside className="fallout-dashboard-side space-y-4">
          <div className="tahoe-card p-5">
            <div className="mb-4 border-b border-border pb-3 text-base font-bold text-amber">
              {t('opponent.title')}
            </div>
            {snapshot?.opponent.revealed.length ? (
              <div className="space-y-2">
                {snapshot.opponent.revealed.slice(0, 6).map((card) => (
                  <OpponentIntelCard key={`${card.entityId}-${card.cardId}`} cardId={card.cardId} />
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-text-dim">{t('opponent.empty')}</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function OpponentIntelCard({ cardId }: { cardId: string }) {
  const def = useCardDef(cardId);
  return (
    <div className="fallout-intel-row rounded border border-border bg-overlay-surface px-3 py-2 text-sm text-text">
      {def?.name ?? cardId}
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="truncate text-text-dim">{label}</span>
      <span className="shrink-0 font-mono text-green">{value}</span>
    </div>
  );
}

interface StatCardProps {
  label: string;
  icon: ReactNode;
  value: ReactNode;
  tone: StatTone;
  compact?: boolean;
}

function StatCard({ label, icon, value, tone, compact = false }: StatCardProps) {
  return (
    <div
      className="tahoe-card tavern-stat-card dashboard-stat-card kpi-card"
      data-testid="dashboard-stat-card"
      data-tone={tone}
    >
      <div className="dashboard-stat-icon" aria-hidden="true">
        {icon}
      </div>
      <div className="dashboard-stat-copy">
        <span className="dashboard-stat-label">{label}</span>
        <div className="dashboard-stat-value" data-compact={compact ? 'true' : undefined}>
          {value}
        </div>
      </div>
    </div>
  );
}
