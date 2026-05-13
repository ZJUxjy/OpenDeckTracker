import type { ReactNode } from 'react';
import { Activity, Clock, Hand, Layers, Radio, Trophy } from 'lucide-react';
import { useHearthMirrorStatus } from '../hooks/use-hearthmirror-status';
import { useDeckTrackerStore } from '../stores/deck-tracker-store';
import { useHearthWatcherStore } from '../stores/hearthwatcher-store';
import { useTranslation } from '../i18n';
import { useCardDef } from '../hooks/use-card-def';
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
  const { medalInfo, isAlive } = useHearthMirrorStatus();
  const watcherStatus = useHearthWatcherStore((s) => s.status);
  const deck = snapshot?.deck ?? null;
  const totalOriginal = deck?.original.reduce((sum, card) => sum + card.count, 0) ?? 0;
  const totalRemaining = deck?.remaining.reduce((sum, card) => sum + card.count, 0) ?? 0;
  const phase = snapshot?.phase ?? 'IDLE';
  const phaseLabel = t(`dashboard.phaseKind.${phase}`);
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
            {isAlive ? t('onboarding.bannerInMatchTitle') : t('deckTracker.hearthstoneNotRunning')}
          </h2>
          <p className="mt-2 text-center text-sm text-green">
            {isAlive ? t('deckTracker.live') : t('deckTracker.hearthstoneNotRunningHint')}
          </p>
          <div className="mt-10 space-y-4 text-sm text-green">
            <StatusLine label={t('dashboard.watcher')} value={watcherKindLabel} />
            <StatusLine label={t('deckTracker.deck')} value={deck ? t('dashboard.statusLive') : t('dashboard.statusIdle')} />
            <StatusLine label={t('dashboard.hand')} value={String(snapshot?.friendlyHand.length ?? 0)} />
            <StatusLine label={t('fallout.statusBar.database')} value="OK" />
          </div>
        </aside>

        <section className="fallout-dashboard-main min-w-0 space-y-4">
          <div className="fallout-page-heading">
            <h1 className="text-3xl font-black text-green">01 {t('sidebar.deckTracker')} / Dashboard</h1>
            <p className="mt-1 text-sm text-text-dim">{t('onboarding.bannerHsNotRunningBody')}</p>
          </div>

          <div className="tahoe-card tavern-hero-card px-7 py-6">
            <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
              <span className="text-base font-bold text-amber">{t('fallout.dashboard.liveBadge')}</span>
              <span className="text-xs text-text-mute">{t('dashboard.phase', { phase: phaseLabel })}</span>
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
                {snapshot ? new Date(snapshot.updatedAt).toLocaleTimeString() : t('dashboard.waitingForGame')}
              </span>
            </div>
          </div>

          <div className="tavern-stat-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="tahoe-card p-5">
              <div className="mb-4 border-b border-border pb-3 text-base font-bold text-amber">
                {t('deckTracker.deck')}
              </div>
              <p className="text-2xl font-black text-green">
                {deck ? deck.name || t('dashboard.unnamedDeck') : t('dashboard.waitingForGame')}
              </p>
              <p className="mt-2 text-sm text-text-dim">
                {totalOriginal > 0 ? `${totalRemaining} / ${totalOriginal} ${t('dashboard.cardsLeft')}` : t('deckTracker.deckNotDetected')}
              </p>
            </div>
            <div className="tahoe-card p-5">
              <div className="mb-4 border-b border-border pb-3 text-base font-bold text-amber">
                {t('fallout.preview.lethal.title')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="fallout-chip">{t('fallout.dashboard.moduleDecks')}</div>
                <div className="fallout-chip">{t('fallout.dashboard.moduleCollection')}</div>
                <div className="fallout-chip">{t('fallout.dashboard.moduleReplay')}</div>
                <div className="fallout-chip fallout-chip-active">{t('fallout.dashboard.moduleLethal')}</div>
              </div>
            </div>
          </div>
        </section>

        <aside className="fallout-dashboard-side space-y-4">
          <div className="tahoe-card p-5">
            <div className="mb-4 border-b border-border pb-3 text-base font-bold text-amber">
              {t('fallout.preview.opponent.title')}
            </div>
            <div className="space-y-3 text-sm">
              <StatusLine label={t('opponent.played')} value="0" />
              <StatusLine label={t('opponent.revealed')} value="0" />
              <StatusLine label={t('opponent.graveyard')} value="0" />
            </div>
            {snapshot?.opponent.revealed.length ? (
              <div className="mt-4 space-y-2">
                {snapshot.opponent.revealed.slice(0, 4).map((card) => (
                  <OpponentIntelCard key={`${card.entityId}-${card.cardId}`} cardId={card.cardId} />
                ))}
              </div>
            ) : null}
          </div>
          <div className="tahoe-card p-5">
            <div className="mb-4 border-b border-border pb-3 text-base font-bold text-amber">
              {t('fallout.preview.replay.title')}
            </div>
            <p className="text-sm leading-6 text-text-dim">{t('fallout.preview.replay.body')}</p>
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
