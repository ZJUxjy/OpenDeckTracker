import { useEffect, useState, type CSSProperties } from 'react';
import type { SetProgress } from '@hdt/core';
import { useTranslation } from '../i18n';
import { useCardImageUrl } from '../hooks/use-card-image-url';

interface SetTileProps {
  row: SetProgress;
  label: string;
  mini: boolean;
  accent: string;
  coverCardId?: string;
  backgroundImageUrl?: string;
  selected?: boolean;
  onClick: (setCode: string) => void;
}

type StatTone = 'complete' | 'empty' | 'partial' | 'neutral';

// Module-level memo: an unknown set always resolves to null. Cache that
// negative result so we don't ping the IPC again on every re-render.
const setLogoUrls = new Map<string, string | null>();

function uniqueTone(row: SetProgress): StatTone {
  if (row.totalCards > 0 && row.ownedUniqueCards === row.totalCards) return 'complete';
  if (row.ownedUniqueCards === 0) return 'empty';
  return 'neutral';
}

function copiesTone(row: SetProgress): StatTone {
  if (row.totalCopies > 0 && row.ownedCopies === row.totalCopies) return 'complete';
  if (row.ownedCopies === 0) return 'empty';
  return 'partial';
}

export function SetTile({
  row,
  label,
  mini,
  accent,
  coverCardId,
  backgroundImageUrl,
  selected,
  onClick,
}: SetTileProps) {
  const { t } = useTranslation();
  const { primary } = useCardImageUrl(coverCardId);
  const cardCoverUrl = coverCardId && primary ? primary : null;

  const [logoUrl, setLogoUrl] = useState<string | null>(() => setLogoUrls.get(row.setCode) ?? null);
  useEffect(() => {
    let cancelled = false;
    const cached = setLogoUrls.get(row.setCode);
    if (cached !== undefined) {
      setLogoUrl(cached);
      return () => { cancelled = true; };
    }
    if (typeof window === 'undefined' || !window.hdt?.setLogos?.get) {
      setLogoUrl(null);
      return () => { cancelled = true; };
    }
    void window.hdt.setLogos.get(row.setCode)
      .then((res) => {
        if (cancelled) return;
        const url = res?.url ?? null;
        setLogoUrls.set(row.setCode, url);
        setLogoUrl(url);
      })
      .catch(() => {
        if (cancelled) return;
        setLogoUrls.set(row.setCode, null);
        setLogoUrl(null);
      });
    return () => { cancelled = true; };
  }, [row.setCode]);

  const complete = row.totalCopies > 0 && row.ownedCopies === row.totalCopies;
  const pct = row.totalCards > 0 ? row.ownedUniqueCards / row.totalCards : 0;
  const pctPercent = Math.round(pct * 100);

  return (
    <button
      type="button"
      onClick={() => onClick(row.setCode)}
      data-testid={`set-tile-${row.setCode}`}
      className={`reference-exp-card${selected ? ' is-selected' : ''}`}
    >
      <div
        data-testid="tile-cover"
        className="reference-exp-cover"
        style={{ '--exp-accent': accent } as CSSProperties}
      >
        {backgroundImageUrl ? (
          <>
            <img
              data-testid="tile-cover-background"
              src={backgroundImageUrl}
              alt=""
              aria-hidden
              loading="lazy"
              className="reference-exp-cover-bg"
            />
            <div className="reference-exp-cover-shade" aria-hidden />
          </>
        ) : null}
        {logoUrl ? (
          <img
            data-testid="tile-cover-logo"
            src={logoUrl}
            alt=""
            aria-hidden
            loading="lazy"
            className="reference-exp-cover-logo"
          />
        ) : cardCoverUrl ? (
          <img
            src={cardCoverUrl}
            alt=""
            aria-hidden
            loading="lazy"
            className="reference-exp-cover-art"
          />
        ) : null}
        {mini && (
          <span
            data-testid="tile-mini-badge"
            className="reference-mini-badge reference-exp-mini-badge"
          >
            {t('collection.tile.miniSet')}
          </span>
        )}
        {complete && (
          <div
            data-testid="tile-complete-badge"
            className="reference-exp-badge reference-exp-complete-badge"
          >
            {t('collection.complete')}
          </div>
        )}
      </div>

      <div className="reference-exp-content">
        <div data-testid="tile-label" className="reference-exp-title">
          {label}
        </div>

        <dl className="reference-exp-stats">
          <div className="reference-exp-stat">
            <dt>{t('collection.tile.uniqueLabel')}</dt>
            <dd data-testid="tile-unique-value" data-tone={uniqueTone(row)}>
              {row.ownedUniqueCards} / {row.totalCards}
            </dd>
          </div>
          <div className="reference-exp-stat">
            <dt>{t('collection.tile.copiesLabel')}</dt>
            <dd data-testid="tile-copies-value" data-tone={copiesTone(row)}>
              {row.ownedCopies} / {row.totalCopies}
            </dd>
          </div>
        </dl>

        <div className="reference-exp-progress">
          <div className="reference-progress-bar reference-exp-bar">
            <div
              className={pct === 1 ? 'is-complete' : ''}
              style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%` }}
            />
          </div>
          <span className="reference-exp-percent">{pctPercent}%</span>
        </div>
      </div>
    </button>
  );
}
