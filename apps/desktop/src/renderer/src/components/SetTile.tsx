import type { SetProgress } from '@hdt/core';
import { useTranslation } from '../i18n';

interface SetTileProps {
  row: SetProgress;
  label: string;
  mini: boolean;
  accent: string;
  selected?: boolean;
  onClick: (setCode: string) => void;
}

export function SetTile({ row, label, mini, accent, selected, onClick }: SetTileProps) {
  const { t } = useTranslation();
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
      {/* Art band */}
      <div
        className="flex flex-col items-center justify-center px-3 py-5 gap-2 h-[140px]"
        style={{ backgroundColor: accent }}
      >
        <span className="text-white font-bold text-base text-center leading-tight">{label}</span>
        {mini && (
          <span
            data-testid="tile-mini-badge"
            className="rounded px-1.5 py-0.5 bg-white text-[9px] font-bold tracking-wider"
            style={{ color: accent }}
          >
            {t('collection.tile.miniSet')}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1.5 px-4 py-3">
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
          ✓ {t('collection.tile.complete')}
        </div>
      )}
    </button>
  );
}
