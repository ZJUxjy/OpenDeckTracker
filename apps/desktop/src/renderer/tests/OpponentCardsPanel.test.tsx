import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
});
