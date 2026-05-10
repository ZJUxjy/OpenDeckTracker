import type { ReactElement } from 'react';
import type { MatchupMatrix as MatchupMatrixData } from '@hdt/core';

import { useTranslation } from '../i18n';

export interface MatchupMatrixProps {
  matrix: MatchupMatrixData | null | undefined;
}

const LOW_CONFIDENCE_THRESHOLD = 5;

function cellColor(winrate: number | null): string {
  if (winrate === null) return 'bg-overlay-surface text-text-mute';
  if (winrate >= 60) return 'bg-green/30 text-green';
  if (winrate >= 50) return 'bg-green/15 text-green';
  if (winrate >= 40) return 'bg-red/15 text-red';
  return 'bg-red/30 text-red';
}

export function MatchupMatrix({ matrix }: MatchupMatrixProps): ReactElement {
  const { t } = useTranslation();

  if (!matrix || matrix.playerClasses.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-48 text-text-mute text-sm"
        data-testid="matchup-matrix-empty"
      >
        {t('stats.matchup.empty')}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid="matchup-matrix">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="px-2 py-1 text-text-dim text-left">{t('stats.matchup.playerHeader')}</th>
            {matrix.opponentClasses.map((oc) => (
              <th key={oc} className="px-2 py-1 text-text-dim font-medium">
                {oc === 'Unknown' ? t('stats.matchup.unknownClass') : oc}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.playerClasses.map((pc) => (
            <tr key={pc} data-testid={`matchup-row-${pc}`}>
              <td className="px-2 py-1 text-text font-medium whitespace-nowrap">
                {pc === 'Unknown' ? t('stats.matchup.unknownClass') : pc}
              </td>
              {matrix.opponentClasses.map((oc) => {
                const cell = matrix.cells[pc]?.[oc];
                const wins = cell?.wins ?? 0;
                const losses = cell?.losses ?? 0;
                const total = wins + losses;
                const winrate = cell?.winrate ?? null;
                const lowConfidence = total > 0 && total < LOW_CONFIDENCE_THRESHOLD;
                return (
                  <td
                    key={oc}
                    data-testid={`matchup-cell-${pc}-${oc}`}
                    className={`px-2 py-1 text-center min-w-[3rem] ${cellColor(winrate)} ${
                      lowConfidence ? 'opacity-50' : ''
                    }`}
                    title={`${wins} - ${losses}`}
                  >
                    {winrate === null ? (
                      <span className="text-text-mute">{t('stats.matchup.emptyCell')}</span>
                    ) : (
                      <>
                        <div className="font-bold">{Math.round(winrate)}%</div>
                        <div className="text-[10px] text-text-dim">
                          {wins}-{losses}
                        </div>
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
