import { memo, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { OpponentCardRecord } from '@hdt/core';
import { useShallow } from 'zustand/react/shallow';
import { useCardPreview } from '../hooks/use-card-preview';
import { matchPresentation } from '../lib/match-presentation';
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
import { useCardLookup } from '../hooks/use-card-def';
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
type TrackerDeckCard = { cardId: string; count: number };

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
  const snapshot = useDeckTrackerStore(useShallow((s) => ({
    deck: s.snapshot?.deck, phase: s.snapshot?.phase, matchInfo: s.snapshot?.matchInfo,
    matchStartedAt: s.snapshot?.matchStartedAt,
    updatedAt: s.snapshot ? Math.floor(s.snapshot.updatedAt / 1000) * 1000 : undefined,
    handCount: s.snapshot?.friendlyHand.length ?? 0,
    opposingHandCount: s.snapshot?.opposingHandCount, opponent: s.snapshot?.opponent,
  })));
  const { medalInfo, isAlive } = useHearthMirrorStatus();
  const watcherStatus = useHearthWatcherStore((s) => s.status);
  const deck = snapshot?.deck ?? null;
  const totalOriginal = deck?.original.reduce((sum, card) => sum + card.count, 0) ?? 0;
  const totalRemaining = deck?.remaining.reduce((sum, card) => sum + card.count, 0) ?? 0;
  const remainingPercent = totalOriginal > 0 ? Math.round((totalRemaining / totalOriginal) * 100) : 0;
  const phase = snapshot?.phase ?? 'IDLE';
  const phaseLabel = t(`dashboard.phaseKind.${phase}`);
  const presentation = matchPresentation(snapshot.matchInfo, medalInfo);
  const modeLabel = t(presentation.modeKey);
  const rankLabel = useRankLabel(presentation.medal);

  const watcherKindLabel = watcherStatus
    ? t(`dashboard.watcherKind.${watcherStatus.kind}`)
    : t('dashboard.watcherDisconnected');

  return (
    <div className="reference-page reference-dashboard flex-1 h-full min-h-0 overflow-hidden">
      <h1 className="sr-only">{t('sidebar.deckTracker')}</h1>

      <div className="reference-dashboard-grid">
        <section className="reference-panel reference-live-panel" data-testid="arcane-live-tracker-panel">
          <header>
            <span className="reference-live-dot" data-live={isAlive && phase === 'IN_MATCH' && watcherStatus?.kind === 'ready'} aria-hidden="true" />
            <b>{t('fallout.dashboard.liveBadge')}</b>
            <span>{t('dashboard.phase', { phase: phaseLabel })}</span>
          </header>
          {deck ? (
            <div className="reference-live-body">
              <div className="reference-active-deck-summary">
                <div className="min-w-0">
                  <span className="reference-active-deck-label">{t('deckTracker.deck')}</span>
                  <h2>{deck.name || t('dashboard.unnamedDeck')}</h2>
                  <p>
                    {modeLabel}
                    <span aria-hidden="true"> · </span>
                    {rankLabel}
                  </p>
                </div>
                <div className="reference-live-count">
                  <b>{totalRemaining}</b>
                  <span>/ {totalOriginal}</span>
                  <small>{t('dashboard.cardsLeft')}</small>
                </div>
              </div>
              <div className="reference-live-progress" aria-label={t('dashboard.cardsLeft')}>
                <span style={{ width: `${remainingPercent}%` }} />
              </div>
              <div className="reference-live-list-head">
                <span>{t('deckTracker.remainingCards')}</span>
                <b>{remainingPercent}%</b>
              </div>
              <div className="reference-live-card-list" data-testid="dashboard-remaining-list">
                {deck.remaining.map((card) => (
                  <DashboardDeckRow key={card.cardId} card={card} />
                ))}
              </div>
            </div>
          ) : (
            <div className="reference-live-empty reference-live-empty-workbench">
              <div className="reference-empty-signal">
                <Activity size={42} aria-hidden="true" />
                <div>
                  <span>{phaseLabel}</span>
                  <h2>{t('dashboard.noActiveDeck')}</h2>
                  <p>{t('dashboard.reference.noActivity')}</p>
                </div>
              </div>
              <div className="reference-connection-hint" role="status">
                <Play size={16} aria-hidden="true" />
                {!isAlive ? t('deckTracker.hearthstoneNotRunning')
                  : watcherStatus?.kind !== 'ready' ? watcherKindLabel : t('reliability.waitingMatch')}
              </div>
              <Link className="reference-action-button" to="/settings?category=data">{t('reliability.diagnostics')}</Link>
            </div>
          )}
          <footer>
            <span className="sr-only">{t('dashboard.rank', { rank: '' })}</span>
            <MiniMeta icon={<FlaskConical size={16} />} label={t('dashboard.reference.mode')} value={modeLabel} />
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
            <span>{t('reliability.opponentHand', { count: snapshot.opposingHandCount ?? 0 })}</span>
          </header>
          {snapshot.opponent?.revealed.length ? (
            <div className="reference-opponent-list">
              {snapshot.opponent.revealed.map((card) => (
                <OpponentIntelCard key={`${card.entityId}-${card.cardId}`} card={card} />
              ))}
            </div>
          ) : (
            <div className="reference-opponent-empty reference-opponent-empty-workbench">
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
          value={snapshot.handCount}
        />
        <StatCard
          tone={phase === 'IN_MATCH' ? 'live' : 'idle'}
          label={t('dashboard.status')}
          icon={<Activity size={20} />}
          value={phaseLabel}
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

const OpponentIntelCard = memo(function OpponentIntelCard({ card }: { card: OpponentCardRecord }) {
  const { t } = useTranslation();
  const { card: def, error, retry } = useCardLookup(card.cardId);
  const preview = useCardPreview();
  return (
    <button type="button" className="fallout-intel-row reference-intel-card"
      onMouseEnter={e => preview.onRowEnter(card.cardId, e.currentTarget)} onMouseLeave={preview.onRowLeave}
      onFocus={e => preview.onRowEnter(card.cardId, e.currentTarget)} onBlur={preview.onRowLeave}
      onClick={e => error ? retry() : preview.onRowEnter(card.cardId, e.currentTarget)}>
      <span className="reference-live-cost">{def?.cost ?? '-'}</span>
      <span className="reference-intel-copy">
        <span className="reference-live-card-name">{def?.name ?? card.cardId}</span>
        <small>{t('reliability.order', { count: card.order })} · {t(`reliability.zone.${card.zone}`)}
          {card.created ? ` · ${t('reliability.created')}` : ''}</small>
        {error && <small role="status">{t('reliability.retryCard')}</small>}
      </span>
    </button>
  );
}, (a, b) => a.card.cardId === b.card.cardId && a.card.order === b.card.order &&
  a.card.zone === b.card.zone && a.card.created === b.card.created);

const DashboardDeckRow = memo(function DashboardDeckRow({ card }: { card: TrackerDeckCard }) {
  const { t } = useTranslation();
  const { card: def, error, retry } = useCardLookup(card.cardId);
  const preview = useCardPreview();
  const cost = typeof def?.cost === 'number' ? def.cost : '-';
  return (
    <button type="button" className="reference-live-card-row"
      onMouseEnter={e => preview.onRowEnter(card.cardId, e.currentTarget)} onMouseLeave={preview.onRowLeave}
      onFocus={e => preview.onRowEnter(card.cardId, e.currentTarget)} onBlur={preview.onRowLeave}
      onClick={e => error ? retry() : preview.onRowEnter(card.cardId, e.currentTarget)}>
      <span className="reference-live-cost">{cost}</span>
      <span className="reference-live-card-name">{def?.name ?? card.cardId}
        {error && <small role="status"> · {t('reliability.retryCard')}</small>}
      </span>
      <span className="reference-live-card-count">x{card.count}</span>
    </button>
  );
}, (a, b) => a.card.cardId === b.card.cardId && a.card.count === b.card.count);

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
