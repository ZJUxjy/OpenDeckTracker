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

  it('shows a pending badge for conditional effects', () => {
    wrap([
      {
        id: 'photon-cannon',
        sourceCardId: 'SC_753',
        triggeredAt: 1000,
        triggerCount: 1,
        pending: true,
      },
    ]);
    expect(screen.getByTestId('global-effect-pending')).toBeInTheDocument();
  });

  it('aggregates Tame Pet into a single Animal Companion pool row (4-cost)', async () => {
    wrap([
      {
        id: 'tame-pet',
        sourceCardId: 'MEND_300',
        triggeredAt: 2000,
        triggerCount: 1,
        params: { pool: ['CS3_022', 'CS3_023', 'CS3_024'] },
      },
    ]);
    expect(screen.getByTestId('animal-companion-pool-row')).toBeInTheDocument();
    // No per-source-card row for the AC cluster.
    expect(screen.queryByText('Tame Pet')).toBeNull();
    expect(screen.getByText(/4-cost Beasts/i)).toBeInTheDocument();

    // Pool detail is in the DOM but visually hidden by default; on
    // hover it becomes visible. Asserting the 3 tiles exist regardless.
    const detail = screen.getByTestId('animal-companion-pool-detail');
    await waitFor(() => {
      const arts = detail.querySelectorAll('[data-testid="card-row-art"]');
      expect(arts).toHaveLength(3);
      const urls = Array.from(arts, (el) => (el as HTMLImageElement).src);
      expect(urls).toEqual([
        'hdt-card-image://tile/CS3_022.png',
        'hdt-card-image://tile/CS3_023.png',
        'hdt-card-image://tile/CS3_024.png',
      ]);
    });
  });

  it('aggregates Roam Free as a 5-cost pool', () => {
    wrap([
      {
        id: 'roam-free',
        sourceCardId: 'MEND_307',
        triggeredAt: 2000,
        triggerCount: 1,
        params: { pool: ['BEAST_A', 'BEAST_B', 'BEAST_C'] },
      },
    ]);
    expect(screen.getByText(/5-cost Beasts/i)).toBeInTheDocument();
  });

  it('aggregates Migrating Elekk as a 4-cost pool', () => {
    wrap([
      {
        id: 'migrating-elekk',
        sourceCardId: 'MEND_303',
        triggeredAt: 2000,
        triggerCount: 1,
        params: { pool: ['ELEKK_A', 'ELEKK_B', 'ELEKK_C'] },
      },
    ]);
    expect(screen.getByText(/4-cost Beasts/i)).toBeInTheDocument();
    const detail = screen.getByTestId('animal-companion-pool-detail');
    expect(detail.querySelectorAll('[data-testid="card-row-art"]')).toHaveLength(3);
  });

  it('latest pool replacement wins when multiple AC pool effects are active', async () => {
    wrap([
      {
        id: 'tame-pet',
        sourceCardId: 'MEND_300',
        triggeredAt: 1000,
        triggerCount: 1,
        params: { pool: ['OLD_1', 'OLD_2', 'OLD_3'] },
      },
      {
        id: 'roam-free',
        sourceCardId: 'MEND_307',
        triggeredAt: 5000,
        triggerCount: 1,
        params: { pool: ['NEW_1', 'NEW_2', 'NEW_3'] },
      },
    ]);
    // Roam Free (later) wins → 5-cost.
    expect(screen.getByText(/5-cost Beasts/i)).toBeInTheDocument();
    const detail = screen.getByTestId('animal-companion-pool-detail');
    await waitFor(() => {
      const arts = detail.querySelectorAll('[data-testid="card-row-art"]');
      const urls = Array.from(arts, (el) => (el as HTMLImageElement).src);
      expect(urls).toEqual([
        'hdt-card-image://tile/NEW_1.png',
        'hdt-card-image://tile/NEW_2.png',
        'hdt-card-image://tile/NEW_3.png',
      ]);
    });
  });

  it('Talya Earthstrider alone shows extra-summon body (no pool tile)', () => {
    wrap([
      {
        id: 'talya-earthstrider',
        sourceCardId: 'MEND_304',
        triggeredAt: 2000,
        triggerCount: 2,
      },
    ]);
    expect(screen.getByTestId('animal-companion-pool-row')).toBeInTheDocument();
    expect(screen.getByText(/\+2 extra/i)).toBeInTheDocument();
    expect(screen.queryByTestId('animal-companion-pool-detail')).toBeNull();
  });

  it('combines Tame Pet + Talya into a single row with both effects mentioned', () => {
    wrap([
      {
        id: 'tame-pet',
        sourceCardId: 'MEND_300',
        triggeredAt: 2000,
        triggerCount: 1,
        params: { pool: ['B1', 'B2', 'B3'] },
      },
      {
        id: 'talya-earthstrider',
        sourceCardId: 'MEND_304',
        triggeredAt: 3000,
        triggerCount: 1,
      },
    ]);
    expect(screen.getAllByTestId('animal-companion-pool-row')).toHaveLength(1);
    expect(screen.getByText(/4-cost Beasts.*\+1 extra/i)).toBeInTheDocument();
  });

  it('AC pool row shows generic title when params not yet extracted', () => {
    wrap([
      {
        id: 'tame-pet',
        sourceCardId: 'MEND_300',
        triggeredAt: 2000,
        triggerCount: 1,
      },
    ]);
    // Cost still known (from EffectDef id), pool tiles absent.
    expect(screen.getByText(/4-cost Beasts/i)).toBeInTheDocument();
    expect(screen.queryByTestId('animal-companion-pool-detail')).toBeNull();
  });
});
