import type { ReactNode } from 'react';
import {
  Activity,
  Clock,
  FlaskConical,
  Hand,
  Layers,
  Play,
  Radio,
  Target,
  Trophy,
  UserRound,
} from 'lucide-react';
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

function formatElapsedDuration(startedAt: number | null | undefined, updatedAt: number | null | undefined): string {
  if (startedAt == null || updatedAt == null || updatedAt < startedAt) return '--:--';
  const totalSeconds = Math.floor((updatedAt - startedAt) / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  const minutesTotal = Math.floor(totalSeconds / 60);
  if (minutesTotal >= 60) {
    const hours = Math.floor(minutesTotal / 60);
    const minutes = String(minutesTotal % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }
  return `${String(minutesTotal).padStart(2, '0')}:${seconds}`;
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
  const rankLabel = useRankLabel(medalInfo?.standard);

  const watcherKindLabel = watcherStatus
    ? t(`dashboard.watcherKind.${watcherStatus.kind}`)
    : t('dashboard.watcherDisconnected');

  return (
    <div className="reference-page reference-dashboard flex-1 h-full min-h-0 overflow-hidden">
      <section className="reference-page-heading">
        <h1>
          <span>01 {t('sidebar.deckTracker')} / </span>
          <strong>Dashboard</strong>
        </h1>
        <p>{t('dashboard.reference.subtitle')}</p>
        <div className="reference-heading-rule" aria-hidden="true" />
      </section>

      <div className="reference-dashboard-grid">
        <section className="reference-panel reference-live-panel" data-testid="arcane-live-tracker-panel">
          <header>
            <span className="reference-live-dot" aria-hidden="true" />
            <b>{t('fallout.dashboard.liveBadge')}</b>
            <span>{t('dashboard.phase', { phase: phaseLabel })}</span>
          </header>
          <div className="reference-live-empty">
            <Activity size={56} aria-hidden="true" />
            <h2>{deck ? deck.name || t('dashboard.unnamedDeck') : t('dashboard.noActiveDeck')}</h2>
            <p>{deck ? t('deckTracker.live') : t('dashboard.reference.noActivity')}</p>
            {!deck && !isAlive ? (
              <div className="reference-primary-action" role="status">
                <Play size={16} />
                {t('deckTracker.hearthstoneNotRunning')}
              </div>
            ) : null}
          </div>
          <footer>
            <span className="sr-only">{t('dashboard.rank', { rank: '' })}</span>
            <MiniMeta icon={<FlaskConical size={16} />} label={t('dashboard.reference.mode')} value={t('dashboard.reference.modeStandard')} />
            <MiniMeta icon={<Target size={16} />} label={t('dashboard.reference.rank')} value={rankLabel} />
            <MiniMeta
              icon={<Clock size={16} />}
              label={t('dashboard.reference.duration')}
              value={formatElapsedDuration(snapshot?.matchStartedAt, snapshot?.updatedAt)}
            />
          </footer>
        </section>

        <aside className="reference-panel reference-opponent-panel" data-testid="arcane-opponent-panel">
          <header>
            <Trophy size={17} aria-hidden="true" />
            <b>{t('opponent.title')}</b>
          </header>
          {snapshot?.opponent.revealed.length ? (
            <div className="reference-opponent-list">
              {snapshot.opponent.revealed.slice(0, 6).map((card) => (
                <OpponentIntelCard key={`${card.entityId}-${card.cardId}`} cardId={card.cardId} />
              ))}
            </div>
          ) : (
            <div className="reference-opponent-empty">
              <UserRound size={56} aria-hidden="true" />
              <h2>{t('opponent.empty')}</h2>
              <p>{t('dashboard.reference.opponentHint')}</p>
            </div>
          )}
        </aside>
      </div>

      <div className="tavern-stat-grid dashboard-stat-grid reference-stat-grid" data-testid="dashboard-stat-grid">
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

function MiniMeta({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="reference-mini-meta">
      <span aria-hidden="true">{icon}</span>
      <div>
        <small>{label}</small>
        <b>{value}</b>
      </div>
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
