import { Gamepad2, Hourglass } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useDeckTrackerStore } from '../stores/deck-tracker-store';
import { useHearthMirrorStatus } from '../hooks/use-hearthmirror-status';
import { useTranslation } from '../i18n';

/**
 * First-run / between-match guidance banner shown above the Tracker
 * route. Auto-hides once a match is active, since at that point the
 * deck panels speak for themselves.
 *
 *   • Hearthstone not running → amber, with offline-feature reassurance
 *   • running but no match    → accent, "waiting for a match"
 *   • IN_MATCH                → null (panels carry the UI)
 */
export function TrackerStatusBanner(): ReactElement | null {
  const { t } = useTranslation();
  const { isAlive } = useHearthMirrorStatus();
  const phase = useDeckTrackerStore((s) => s.snapshot?.phase);

  if (phase === 'IN_MATCH') return null;

  if (!isAlive) {
    return (
      <Banner
        tone="warn"
        icon={<Gamepad2 size={18} className="text-amber" />}
        title={t('onboarding.bannerHsNotRunningTitle')}
        body={t('onboarding.bannerHsNotRunningBody')}
      />
    );
  }

  return (
    <Banner
      tone="info"
      icon={<Hourglass size={18} className="text-accent" />}
      title={t('onboarding.bannerWaitingTitle')}
      body={t('onboarding.bannerWaitingBody')}
    />
  );
}

interface BannerProps {
  tone: 'info' | 'warn';
  icon: ReactNode;
  title: string;
  body: string;
}

function Banner({ tone, icon, title, body }: BannerProps): ReactElement {
  const toneClass =
    tone === 'warn'
      ? 'border-amber/30 bg-amber/5'
      : 'border-accent/20 bg-accent/5';
  return (
    <div
      data-testid="tracker-status-banner"
      className={`shrink-0 mx-6 mt-4 px-4 py-3 rounded-lg border flex items-start gap-3 ${toneClass}`}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-text font-medium text-sm">{title}</div>
        <p className="text-text-dim text-xs mt-1 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
