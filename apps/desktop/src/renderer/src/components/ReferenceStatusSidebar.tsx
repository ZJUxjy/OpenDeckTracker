import { Database, Hand, Layers, Play, Radio, ShieldCheck } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from '../i18n';
import { useDeckTrackerStore } from '../stores/deck-tracker-store';
import { useHearthWatcherStore } from '../stores/hearthwatcher-store';
import { useHearthMirrorStatus } from '../hooks/use-hearthmirror-status';
import logoHsCut from '../assets/reference-ui/logo-hs-cut.png';
import glyphDb from '../assets/reference-ui/glyph/db-c.png';
import glyphDeck from '../assets/reference-ui/glyph/deck-c.png';
import glyphHand from '../assets/reference-ui/glyph/hand-c.png';
import glyphSignal from '../assets/reference-ui/glyph/signal-c.png';

function StatusGlyph({ src, alt }: { src: string; alt: string }): ReactElement {
  return (
    <span className="reference-status-glyph" aria-hidden="true">
      <img src={src} alt={alt} />
    </span>
  );
}

function StatusRow({
  icon,
  label,
  title,
  body,
  ok,
}: {
  icon: ReactElement;
  label: string;
  title: string;
  body: string;
  ok?: boolean;
}): ReactElement {
  return (
    <section className="reference-side-section">
      <div className="reference-side-label">{label}</div>
      <div className="reference-side-row">
        {icon}
        <div className="min-w-0">
          <b>{title}</b>
          <span>{body}</span>
        </div>
        {ok ? <span className="reference-ok-dot" aria-hidden="true" /> : null}
      </div>
    </section>
  );
}

export function ReferenceStatusSidebar(): ReactElement {
  const { t } = useTranslation();
  const snapshot = useDeckTrackerStore((s) => s.snapshot);
  const watcherStatus = useHearthWatcherStore((s) => s.status);
  const { isAlive } = useHearthMirrorStatus();
  const deck = snapshot?.deck ?? null;
  const phase = snapshot?.phase ?? 'IDLE';
  const watcherLabel = watcherStatus
    ? t(`dashboard.watcherKind.${watcherStatus.kind}`)
    : t('dashboard.watcherDisconnected');
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

  return (
    <aside className="reference-sidebar" data-testid="reference-status-sidebar">
      <section className="reference-side-section">
        <div className="reference-side-label">
          <ShieldCheck size={14} />
          {t('dashboard.connection')}
        </div>
        <div className="reference-connection-card">
          <img src={logoHsCut} alt="" aria-hidden="true" />
          <div>
            <h2>{connectionTitle}</h2>
            <p>{connectionHint}</p>
          </div>
        </div>
        <div className="reference-launch-status" role="status">
          <Play size={15} />
          {isAlive ? t('deckTracker.live') : t('deckTracker.hearthstoneNotRunning')}
        </div>
      </section>

      <StatusRow
        label={t('dashboard.watcher')}
        title={watcherLabel}
        body={watcherStatus ? watcherStatus.message : t('dashboard.watcherDisconnected')}
        icon={<StatusGlyph src={glyphSignal} alt="" />}
        ok={watcherStatus?.kind === 'ready'}
      />
      <StatusRow
        label={t('deckTracker.deck')}
        title={deck ? deck.name || t('dashboard.unnamedDeck') : t('dashboard.statusIdle')}
        body={deck ? t('dashboard.statusLive') : t('dashboard.reference.noDeckSelected')}
        icon={<StatusGlyph src={glyphDeck} alt="" />}
      />
      <StatusRow
        label={t('dashboard.hand')}
        title={t('dashboard.handCountValue', { count: snapshot?.friendlyHand.length ?? 0 })}
        body={t('dashboard.hand')}
        icon={<StatusGlyph src={glyphHand} alt="" />}
      />
      <StatusRow
        label={t('fallout.statusBar.database')}
        title="OK"
        body={t('collection.dbCards')}
        icon={<StatusGlyph src={glyphDb} alt="" />}
        ok
      />

      <div className="reference-sidebar-icons" aria-hidden="true">
        <Radio size={14} />
        <Layers size={14} />
        <Hand size={14} />
        <Database size={14} />
      </div>
    </aside>
  );
}
