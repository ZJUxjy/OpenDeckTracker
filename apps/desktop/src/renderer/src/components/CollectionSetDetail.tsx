import { SET_LABELS } from '@hdt/hearthdb';
import type { SetProgress } from '@hdt/core';

import { useTranslation } from '../i18n';

interface CollectionSetDetailProps {
  setCode: string;
  row: SetProgress;
  ownedByDbfId: Map<number, number>;
  onBack: () => void;
}

function isMiniSet(label: string): boolean {
  return /mini[- ]set|迷你/i.test(label);
}

export function CollectionSetDetail({ setCode, row, onBack }: CollectionSetDetailProps) {
  const { t, locale } = useTranslation();
  const entry = SET_LABELS[setCode];
  const localizedName = entry?.[locale] ?? entry?.['en-US'] ?? t('collection.progress.unknownSet', { code: setCode });
  const englishName = entry?.['en-US'] ?? setCode;
  const mini = isMiniSet(localizedName);
  const complete = row.totalCopies > 0 && row.ownedCopies === row.totalCopies;
  const uniqueComplete = row.totalCards > 0 && row.ownedUniqueCards === row.totalCards;

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            data-testid="detail-back"
            className="w-10 h-10 rounded-md tahoe-card flex items-center justify-center text-text hover:text-accent"
            aria-label="Back"
          >
            <span className="text-base font-semibold">←</span>
          </button>
          <div
            className="w-13 h-13 rounded-md flex items-center justify-center"
            style={{ width: 52, height: 52, backgroundColor: 'var(--class-neutral)' }}
            aria-hidden
          />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-text leading-tight">{localizedName}</h1>
              {mini && (
                <span
                  data-testid="detail-mini-badge"
                  className="rounded px-1.5 py-0.5 bg-overlay-surface text-text-secondary text-[10px] font-bold tracking-wider"
                >
                  {t('collection.tile.miniSet')}
                </span>
              )}
            </div>
            <p data-testid="detail-subtitle" className="text-sm text-text-secondary">
              {t('collection.detail.subtitle', { english: englishName, total: row.totalCards })}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-baseline gap-1.5">
            <span
              data-testid="detail-unique-value"
              className={`text-2xl font-bold font-mono tabular-nums ${uniqueComplete ? 'text-green' : 'text-accent'}`}
            >
              {row.ownedUniqueCards}
            </span>
            <span data-testid="detail-unique-total" className="text-sm text-text-tertiary font-medium font-mono tabular-nums">
              {t('collection.detail.uniqueProgress', { total: row.totalCards })}
            </span>
          </div>
          {complete && (
            <span
              data-testid="detail-complete-pill"
              className="rounded-full bg-green text-white text-[11px] font-semibold px-2.5 py-0.5"
            >
              {t('collection.detail.complete')}
            </span>
          )}
        </div>
      </div>
      {/* Filter row + card grid filled in section 6 */}
    </div>
  );
}
