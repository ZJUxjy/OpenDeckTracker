import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpponentCardRecord } from '@hdt/core';
import type { CardDef } from '@hdt/hearthdb';
import { OpponentCardsPanel } from '../src/components/OpponentCardsPanel';

const CARD_DEFS: Record<string, { name: string; cost: number; rarity: NonNullable<CardDef['rarity']> }> = {
  CS2_029: { name: 'Fireball', cost: 4, rarity: 'COMMON' },
  CS2_024: { name: 'Frostbolt', cost: 2, rarity: 'COMMON' },
};

function record(
  overrides: Partial<OpponentCardRecord> & Pick<OpponentCardRecord, 'entityId' | 'cardId'>,
): OpponentCardRecord {
  return {
    zone: 'PLAY',
    order: overrides.entityId,
    created: false,
    ...overrides,
  };
}

describe('OpponentCardsPanel', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    window.hdt.cardImages.get = vi.fn().mockResolvedValue(null);
    window.hdt.cardImages.getTile = vi.fn(async (cardId: string) => ({
      url: `hdt-card-image://tile/${cardId}.png`,
    }));
    window.hdt.cards.findById = vi.fn(async (cardId: string) => {
      const def = CARD_DEFS[cardId];
      if (!def) return null;
      const cardDef: CardDef = {
        id: cardId,
        dbfId: 0,
        name: def.name,
        cost: def.cost,
        cardClass: 'MAGE',
        rarity: def.rarity,
        set: 'TEST',
        type: 'SPELL',
        collectible: true,
      };
      return cardDef;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders revealed opponent cards by card name', async () => {
    render(
      <OpponentCardsPanel
        revealed={[record({ entityId: 20, cardId: 'CS2_029' })]}
        graveyard={[]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Fireball')).toBeInTheDocument();
    });
  });

  it('cumulative `revealed` includes already-killed cards (no separate graveyard section)', async () => {
    // The deck-tracker now feeds GRAVEYARD entries through `revealed`
    // too, so the panel surfaces them in the single cumulative list
    // rather than a separate "Graveyard" section. Test that:
    //   1. A killed card still appears (cumulative behaviour),
    //   2. The legacy "Graveyard" header is no longer rendered.
    render(
      <OpponentCardsPanel
        revealed={[record({ entityId: 21, cardId: 'CS2_024', zone: 'GRAVEYARD' })]}
        graveyard={[record({ entityId: 21, cardId: 'CS2_024', zone: 'GRAVEYARD' })]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Frostbolt')).toBeInTheDocument();
    });
    expect(screen.queryByText('Graveyard')).toBeNull();
  });

  it('renders an empty state when no opponent cards are revealed', () => {
    // setup.ts mocks `isAlive` → false, so the panel surfaces the
    // "Hearthstone not running" copy rather than the generic
    // "no opponent cards" string. Both are valid empty states; this
    // assertion mirrors the default test environment.
    render(<OpponentCardsPanel revealed={[]} graveyard={[]} />);

    expect(screen.getByText('Hearthstone not running')).toBeInTheDocument();
  });

  it('highlights opposing board attack in green when it is below friendly hero effective health', () => {
    render(
      <OpponentCardsPanel
        revealed={[]}
        graveyard={[]}
        boardAttack={8}
        targetEffectiveHealth={15}
      />,
    );

    const card = screen.getByTestId('opposing-board-attack-card');
    expect(card).toHaveClass('text-green');
    expect(screen.getByTestId('opposing-board-attack-value')).toHaveTextContent('8');
    expect(card).toHaveTextContent('/ 15');
  });

  it('highlights opposing board attack in red when it threatens lethal', () => {
    render(
      <OpponentCardsPanel
        revealed={[]}
        graveyard={[]}
        boardAttack={15}
        targetEffectiveHealth={15}
      />,
    );

    expect(screen.getByTestId('opposing-board-attack-card')).toHaveClass('text-red');
  });

  it('routes opponent row art through the local cache protocol (never a CDN URL)', async () => {
    render(
      <OpponentCardsPanel
        revealed={[
          record({ entityId: 20, cardId: 'CS2_029' }),
          record({ entityId: 21, cardId: 'CS2_024' }),
        ]}
        graveyard={[]}
      />,
    );

    await waitFor(() => {
      const arts = screen.getAllByTestId('card-row-art');
      expect(arts).toHaveLength(2);
      for (const el of arts) {
        const url = (el as HTMLImageElement).src;
        expect(url).toMatch(/^hdt-card-image:\/\/tile\//);
        expect(url).not.toContain('art.hearthstonejson.com');
      }
    });
  });

  it('groups duplicate opponent records by cardId', async () => {
    render(
      <OpponentCardsPanel
        revealed={[
          record({ entityId: 20, cardId: 'CS2_029', order: 1 }),
          record({ entityId: 21, cardId: 'CS2_029', order: 2 }),
        ]}
        graveyard={[]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Fireball')).toBeInTheDocument();
      expect(screen.getByText('x2')).toBeInTheDocument();
    });
  });

  it('invokes cardPreview.show after hovering an opponent card row past threshold', async () => {
    const cardPreviewShow = vi.fn();
    const cardPreviewHide = vi.fn();
    const savedHdt = window.hdt;
    (window as { hdt: typeof window.hdt }).hdt = {
      ...savedHdt,
      cardPreview: {
        show: cardPreviewShow,
        showPool: vi.fn(),
        hide: cardPreviewHide,
        onSetCard: vi.fn(() => () => {}),
        onSetPool: vi.fn(() => () => {}),
      },
    };
    try {
      render(
        <OpponentCardsPanel
          revealed={[record({ entityId: 20, cardId: 'CS2_029' })]}
          graveyard={[]}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Fireball')).toBeInTheDocument();
      });

      vi.useFakeTimers();
      fireEvent.mouseEnter(screen.getByTestId('opponent-card-row'));
      expect(cardPreviewShow).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(cardPreviewShow).toHaveBeenCalledTimes(1);
      expect(cardPreviewShow.mock.calls[0]![0]).toBe('CS2_029');
    } finally {
      vi.useRealTimers();
      (window as { hdt: typeof window.hdt }).hdt = savedHdt;
    }
  });
});
