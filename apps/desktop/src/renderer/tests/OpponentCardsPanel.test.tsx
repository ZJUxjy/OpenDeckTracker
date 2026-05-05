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
    ...overrides,
  };
}

describe('OpponentCardsPanel', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    window.hdt.cardImages.get = vi.fn().mockResolvedValue(null);
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

  it('renders opponent graveyard cards in a separate section', async () => {
    render(
      <OpponentCardsPanel
        revealed={[]}
        graveyard={[record({ entityId: 21, cardId: 'CS2_024', zone: 'GRAVEYARD' })]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Graveyard')).toBeInTheDocument();
      expect(screen.getByText('Frostbolt')).toBeInTheDocument();
    });
  });

  it('renders an empty state when no opponent cards are revealed', () => {
    render(<OpponentCardsPanel revealed={[]} graveyard={[]} />);

    expect(screen.getByText('No opponent cards revealed')).toBeInTheDocument();
  });

  it('renders a card-row-art portrait img per opponent row using the frame-less art URL', async () => {
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
      const urls = arts.map((el) => (el as HTMLImageElement).src);
      // First-paint URLs are the CDN tile URLs; once cached they swap to
      // hdt-card-image://tile/... Either form is acceptable here as long
      // as we never use the framed render or the legacy /tiles/ endpoint.
      for (const url of urls) {
        expect(url).not.toContain('/render/');
        expect(url).not.toContain('/tiles/');
        expect(url).toMatch(/\/v1\/orig\/|^hdt-card-image:\/\/tile\//);
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
        hide: cardPreviewHide,
        onSetCard: vi.fn(() => () => {}),
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
