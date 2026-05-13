import { Crosshair, Film, ShieldAlert, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../i18n';

type FeaturePreviewKind = 'opponent' | 'lethal' | 'replay';

const FEATURE_ICONS: Record<FeaturePreviewKind, LucideIcon> = {
  opponent: ShieldAlert,
  lethal: Crosshair,
  replay: Film,
};

export function FeaturePreviewPage({ kind }: { kind: FeaturePreviewKind }) {
  const { t } = useTranslation();
  const Icon = FEATURE_ICONS[kind];

  return (
    <div className="fallout-feature-page flex-1 overflow-y-auto p-6">
      <div className="fallout-terminal-hero tahoe-card p-7">
        <div className="flex items-center gap-3">
          <span className="fallout-terminal-icon flex h-12 w-12 items-center justify-center rounded-lg">
            <Icon size={24} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber">
              {t('fallout.preview.eyebrow')}
            </p>
            <h1 className="mt-1 truncate text-3xl font-black text-text">
              {t(`fallout.preview.${kind}.title`)}
            </h1>
          </div>
        </div>
        <p className="mt-5 max-w-3xl text-sm leading-6 text-text-dim">
          {t(`fallout.preview.${kind}.body`)}
        </p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((idx) => (
          <div key={idx} className="tahoe-card p-5">
            <div className="mb-3 flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-base font-bold text-amber">
                {t(`fallout.preview.${kind}.card${idx}.title`)}
              </h2>
              <span className="h-2 w-2 rounded-full bg-green shadow-[0_0_12px_var(--green)]" />
            </div>
            <p className="text-sm leading-6 text-text-dim">
              {t(`fallout.preview.${kind}.card${idx}.body`)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
