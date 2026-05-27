import { useEffect, useState } from 'react';
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

// Module-level memo: an unknown set always resolves to null. Cache that
// negative result so we don't ping the IPC again on every re-render.
const setLogoUrls = new Map<string, string | null>();

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

  const copiesColor =
    row.totalCopies > 0 && row.ownedCopies === row.totalCopies
      ? 'text-green'
      : row.ownedCopies === 0
        ? 'text-red'
        : 'text-amber';

  const uniqueColor =
    row.totalCards > 0 && row.ownedUniqueCards === row.totalCards
      ? 'text-green'
      : 'text-text';

  return (
    <button
      type="button"
      onClick={() => onClick(row.setCode)}
      data-testid={`set-tile-${row.setCode}`}
      className={
        'tahoe-card relative overflow-hidden text-left transition-transform hover:scale-[1.01] ' +
        (selected ? 'ring-2 ring-accent' : '')
      }
    >
      {/* Cover band — prefer official set logo (transparent PNG, contained
          and centered against the accent fill), fall back to representative
          card art (cropped to its illustration). Accent color is always
          painted underneath so the band is never blank. */}
      <div
        data-testid="tile-cover"
        className="relative h-[140px] overflow-hidden"
        style={{ backgroundColor: accent }}
      >
        {backgroundImageUrl ? (
          <>
            <img
              data-testid="tile-cover-background"
              src={backgroundImageUrl}
              alt=""
              aria-hidden
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover opacity-30 scale-[1.04]"
              style={{ objectPosition: 'center 48%' }}
            />
            <div className="absolute inset-0 bg-black/35" aria-hidden />
          </>
        ) : null}
        {logoUrl ? (
          <img
            data-testid="tile-cover-logo"
            src={logoUrl}
            alt=""
            aria-hidden
            loading="lazy"
            className="relative z-10 w-full h-full object-contain p-3"
          />
        ) : cardCoverUrl ? (
          <img
            src={cardCoverUrl}
            alt=""
            aria-hidden
            loading="lazy"
            className="relative z-10 w-full h-full object-cover"
            style={{ objectPosition: 'center 18%' }}
          />
        ) : null}
        {mini && (
          <span
            data-testid="tile-mini-badge"
            className="absolute z-20 top-2 right-2 rounded px-1.5 py-0.5 bg-white text-[9px] font-bold tracking-wider"
            style={{ color: accent }}
          >
            {t('collection.tile.miniSet')}
          </span>
        )}
      </div>

      {/* Label sits below the cover, centered */}
      <div
        data-testid="tile-label"
        className="px-3 pt-3 text-center text-text font-bold text-base leading-tight"
      >
        {label}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1.5 px-4 pt-2 pb-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-secondary font-medium">{t('collection.tile.uniqueLabel')}</span>
          <span
            data-testid="tile-unique-value"
            className={`font-semibold font-mono tabular-nums ${uniqueColor}`}
          >
            {row.ownedUniqueCards} / {row.totalCards}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-secondary font-medium">{t('collection.tile.copiesLabel')}</span>
          <span
            data-testid="tile-copies-value"
            className={`font-semibold font-mono tabular-nums ${copiesColor}`}
          >
            {row.ownedCopies} / {row.totalCopies}
          </span>
        </div>
        <div className="w-full bg-overlay-surface dark:bg-white/8 rounded-full h-1 overflow-hidden">
          <div
            className={`h-1 rounded-full ${pct === 1 ? 'bg-green' : 'bg-accent'}`}
            style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%` }}
          />
        </div>
      </div>

      {complete && (
        <div
          data-testid="tile-complete-badge"
          className="absolute top-2 left-2 rounded-full bg-green text-white text-[10px] font-bold px-2 py-0.5"
        >
          {t('collection.complete')}
        </div>
      )}
    </button>
  );
}
