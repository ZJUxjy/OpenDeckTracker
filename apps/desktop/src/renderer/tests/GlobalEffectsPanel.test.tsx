import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveEffect } from '@hdt/core';
import { I18nProvider } from '../src/i18n';
import { GlobalEffectsPanel } from '../src/components/GlobalEffectsPanel';

beforeEach(() => {
  window.hdt.cardImages.getTile = vi.fn(async (cardId: string) => ({
    url: `hdt-card-image://tile/${cardId}.png`,
  }));
});

function wrap(effects: ActiveEffect[]) {
  return render(
    <I18nProvider preference="en-US">
      <GlobalEffectsPanel side="player" effects={effects} />
    </I18nProvider>,
  );
}

describe('GlobalEffectsPanel', () => {
  it('renders empty state when there are no effects', () => {
    wrap([]);
    expect(screen.getByText('No active global effects')).toBeInTheDocument();
    expect(screen.queryByTestId('global-effect-row')).toBeNull();
  });

  it('renders Cleansing Cleric without a params region', async () => {
    wrap([
      {
        id: 'cleansing-cleric',
        sourceCardId: 'CATA_216',
        triggeredAt: 1000,
        triggerCount: 1,
      },
    ]);
    const rows = screen.getAllByTestId('global-effect-row');
    expect(rows).toHaveLength(1);
    expect(screen.getByText('Cleansing Cleric')).toBeInTheDocument();
    expect(screen.queryByTestId('global-effect-params')).toBeNull();
    expect(screen.queryByTestId('global-effect-stack-count')).toBeNull();
  });

  it('shows ×N stack badge when triggerCount > 1', () => {
    wrap([
      {
        id: 'free-spirit',
        sourceCardId: 'ETC_382',
        triggeredAt: 1000,
        triggerCount: 3,
      },
    ]);
    const badge = screen.getByTestId('global-effect-stack-count');
    expect(badge.textContent).toBe('×3');
  });

  it('renders Tame Pet with the beast pool when params are present', async () => {
    wrap([
      {
        id: 'tame-pet',
        sourceCardId: 'MEND_300',
        triggeredAt: 2000,
        triggerCount: 1,
        params: { pool: ['CS3_022', 'CS3_023', 'CS3_024'] },
      },
    ]);
    const params = await screen.findByTestId('global-effect-params');
    expect(params).toBeInTheDocument();
    await waitFor(() => {
      const arts = screen.getAllByTestId('card-row-art');
      expect(arts).toHaveLength(3);
      const urls = arts.map((el) => (el as HTMLImageElement).src);
      expect(urls).toEqual([
        'hdt-card-image://tile/CS3_022.png',
        'hdt-card-image://tile/CS3_023.png',
        'hdt-card-image://tile/CS3_024.png',
      ]);
    });
  });

  it('renders Tame Pet without params region when params are missing', () => {
    wrap([
      {
        id: 'tame-pet',
        sourceCardId: 'MEND_300',
        triggeredAt: 2000,
        triggerCount: 1,
      },
    ]);
    expect(screen.getByText('Tame Pet')).toBeInTheDocument();
    expect(screen.queryByTestId('global-effect-params')).toBeNull();
  });

  it('renders Roam Free with the same pool treatment as Tame Pet', async () => {
    wrap([
      {
        id: 'roam-free',
        sourceCardId: 'MEND_307',
        triggeredAt: 2000,
        triggerCount: 1,
        params: { pool: ['BEAST_A', 'BEAST_B', 'BEAST_C'] },
      },
    ]);
    const params = await screen.findByTestId('global-effect-params');
    expect(params).toBeInTheDocument();
    await waitFor(() => {
      const arts = screen.getAllByTestId('card-row-art');
      expect(arts).toHaveLength(3);
      const urls = arts.map((el) => (el as HTMLImageElement).src);
      expect(urls).toEqual([
        'hdt-card-image://tile/BEAST_A.png',
        'hdt-card-image://tile/BEAST_B.png',
        'hdt-card-image://tile/BEAST_C.png',
      ]);
    });
  });
});
