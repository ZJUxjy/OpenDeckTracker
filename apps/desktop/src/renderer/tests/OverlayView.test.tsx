import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverlayView } from '../src/components/OverlayView';
import { useDeckTrackerStore } from '../src/stores/deck-tracker-store';
import type { DeckTrackerSnapshot } from '@hdt/core';

function makeSnapshot(): DeckTrackerSnapshot {
  return {
    phase: 'IN_MATCH',
    matchInfo: {
      localPlayer: null,
      opposingPlayer: null,
      missionId: 0,
      gameType: 0,
      formatType: 0,
      rankedSeasonId: 0,
      arenaSeasonId: 0,
      brawlSeasonId: 0,
    },
    deck: {
      id: 1,
      name: 'Test Deck',
      original: [{ cardId: 'CS2_029', count: 2 }],
      remaining: [{ cardId: 'CS2_029', count: 2 }],
      extras: [],
    },
    pendingDeckSelection: null,
    friendlyHand: [],
    opposingHandCount: 0,
    opponent: {
      revealed: [],
      graveyard: [],
    },
    opponentClass: null,
    friendlyGraveyard: [],
    friendlyDeckCount: 2,
    friendlyEffects: [],
    opposingEffects: [],
    boardAttack: { friendly: 0, opposing: 0 },
    boardAttackToFace: { friendly: 0, opposing: 0 },
    error: null,
    updatedAt: Date.now(),
  };
}

const CARD_DEFS: Record<string, { name: string; cost?: number; rarity?: string }> = {
  CS2_029: { name: 'Fireball', cost: 4, rarity: 'COMMON' },
};

vi.mock('../src/hooks/use-card-def', () => ({
  useCardDef: (cardId: string) => {
    const def = CARD_DEFS[cardId];
    if (!def) return null;
    return {
      id: cardId,
      dbfId: 0,
      name: def.name,
      ...(def.cost !== undefined ? { cost: def.cost } : {}),
      cardClass: 'MAGE',
      ...(def.rarity ? { rarity: def.rarity } : {}),
      set: 'TEST',
      type: 'SPELL',
      collectible: true,
    };
  },
}));

describe('OverlayView', () => {
  beforeEach(() => {
    (window as unknown as { hdt: unknown }).hdt = {
      cards: {
        findById: vi.fn(async (cardId: string) => {
          const def = CARD_DEFS[cardId];
          if (!def) return null;
          return {
            id: cardId,
            dbfId: 0,
            name: def.name,
            ...(def.cost !== undefined ? { cost: def.cost } : {}),
            cardClass: 'MAGE',
            ...(def.rarity ? { rarity: def.rarity } : {}),
            set: 'TEST',
            type: 'SPELL',
            collectible: true,
          };
        }),
      },
    };
    useDeckTrackerStore.setState({
      snapshot: null,
      pendingSelection: null,
      dialogDismissed: false,
    });
  });

  afterEach(() => {
    (window as unknown as { hdt?: unknown }).hdt = undefined;
  });

  it('renders the per-copy LiveDeckPanel layout (matches main window)', () => {
    const snap = makeSnapshot();
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<OverlayView />);

    // The overlay must use the same per-copy layout as the main window —
    // one card-copy-row per remaining physical copy, no compact pip rows.
    const copyRows = screen.queryAllByTestId('card-copy-row');
    expect(copyRows).toHaveLength(2);
    expect(screen.queryAllByTestId('card-compact-row')).toHaveLength(0);
  });
});
