import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MatchupMatrix as MatchupMatrixData } from '@hdt/core';

import { MatchupMatrix } from '../src/components/MatchupMatrix';
import { I18nProvider } from '../src/i18n';

function renderMatrix(matrix: MatchupMatrixData | null) {
  return render(
    <I18nProvider preference="en-US">
      <MatchupMatrix matrix={matrix} />
    </I18nProvider>,
  );
}

describe('MatchupMatrix', () => {
  it('renders the empty placeholder for null matrix', () => {
    renderMatrix(null);
    expect(screen.getByTestId('matchup-matrix-empty')).toBeInTheDocument();
  });

  it('renders the empty placeholder for empty matrix', () => {
    renderMatrix({ cells: {}, playerClasses: [], opponentClasses: [] });
    expect(screen.getByTestId('matchup-matrix-empty')).toBeInTheDocument();
  });

  it('renders cells for present matchups', () => {
    const matrix: MatchupMatrixData = {
      cells: {
        DRUID: { MAGE: { wins: 7, losses: 3, winrate: 70 } },
      },
      playerClasses: ['DRUID'],
      opponentClasses: ['MAGE'],
    };
    renderMatrix(matrix);
    expect(screen.getByTestId('matchup-cell-DRUID-MAGE')).toBeInTheDocument();
    expect(screen.getByTestId('matchup-cell-DRUID-MAGE').textContent).toContain('70%');
    expect(screen.getByTestId('matchup-cell-DRUID-MAGE').textContent).toContain('7-3');
  });

  it('renders empty-cell placeholder when winrate is null', () => {
    const matrix: MatchupMatrixData = {
      cells: {
        DRUID: { MAGE: { wins: 0, losses: 0, winrate: null } },
      },
      playerClasses: ['DRUID'],
      opponentClasses: ['MAGE'],
    };
    renderMatrix(matrix);
    expect(screen.getByTestId('matchup-cell-DRUID-MAGE').textContent).toContain('—');
  });

  it('marks low-confidence cells with reduced opacity', () => {
    const matrix: MatchupMatrixData = {
      cells: {
        DRUID: { MAGE: { wins: 1, losses: 1, winrate: 50 } }, // 2 matches < 5 threshold
      },
      playerClasses: ['DRUID'],
      opponentClasses: ['MAGE'],
    };
    renderMatrix(matrix);
    const cell = screen.getByTestId('matchup-cell-DRUID-MAGE');
    expect(cell.className).toContain('opacity-50');
  });

  it('uses winning color for winrate >= 60', () => {
    const matrix: MatchupMatrixData = {
      cells: {
        DRUID: { MAGE: { wins: 7, losses: 3, winrate: 70 } },
      },
      playerClasses: ['DRUID'],
      opponentClasses: ['MAGE'],
    };
    renderMatrix(matrix);
    const cell = screen.getByTestId('matchup-cell-DRUID-MAGE');
    expect(cell.className).toContain('emerald');
  });

  it('renders Unknown row label when player class is Unknown', () => {
    const matrix: MatchupMatrixData = {
      cells: {
        Unknown: { MAGE: { wins: 1, losses: 0, winrate: 100 } },
      },
      playerClasses: ['Unknown'],
      opponentClasses: ['MAGE'],
    };
    renderMatrix(matrix);
    expect(screen.getByTestId('matchup-row-Unknown')).toBeInTheDocument();
    // Localized label
    const row = screen.getByTestId('matchup-row-Unknown');
    expect(row.textContent).toContain('Unknown');
  });
});
