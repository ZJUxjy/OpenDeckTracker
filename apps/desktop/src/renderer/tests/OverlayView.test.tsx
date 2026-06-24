import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverlayView } from '../src/components/OverlayView';
import { useDeckTrackerStore } from '../src/stores/deck-tracker-store';
import type { DeckTrackerSnapshot } from '@hdt/core';

function makeSnapshot(
  overrides: {
    deck?: DeckTrackerSnapshot['deck'];
    friendlyHand?: string[];
    friendlyHandExtras?: boolean[];
    extraDisplay?: DeckTrackerSnapshot['extraDisplay'];
  } = {},
): DeckTrackerSnapshot {
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
    deck: overrides.deck ?? {
      id: 1,
      name: 'Test Deck',
      original: [{ cardId: 'CS2_029', count: 2 }],
      remaining: [{ cardId: 'CS2_029', count: 2 }],
      extraRemaining: [],
      extras: [],
      knownPositions: [],
    },
    pendingDeckSelection: null,
    friendlyHand: overrides.friendlyHand ?? [],
    friendlyHandExtras: overrides.friendlyHandExtras ?? [],
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
    friendlyHero: null,
    opposingHero: null,
    playerClass: null,
    ...(overrides.extraDisplay !== undefined ? { extraDisplay: overrides.extraDisplay } : {}),
    error: null,
    updatedAt: Date.now(),
  };
}

const CARD_DEFS: Record<
  string,
  {
    name: string;
    cost?: number;
    rarity?: string;
    mechanics?: string[];
    referencedTags?: string[];
    text?: string;
  }
> = {
  CS2_029: { name: 'Fireball', cost: 4, rarity: 'COMMON' },
  CATA_497: {
    name: '奥卓克希昂',
    cost: 6,
    rarity: 'LEGENDARY',
    mechanics: ['HERALD', 'BATTLECRY'],
    text: '<b>战吼：</b><b>兆示</b>{0}。',
  },
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
      ...(def.mechanics ? { mechanics: def.mechanics } : {}),
      ...(def.referencedTags ? { referencedTags: def.referencedTags } : {}),
      ...(def.text ? { text: def.text } : {}),
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
            ...(def.mechanics ? { mechanics: def.mechanics } : {}),
            ...(def.referencedTags ? { referencedTags: def.referencedTags } : {}),
            ...(def.text ? { text: def.text } : {}),
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

  it('shows Herald counters in the player overlay deck tab', () => {
    const snap = makeSnapshot({
      deck: {
        id: 1,
        name: 'Herald Test',
        original: [{ cardId: 'CATA_497', count: 1 }],
        remaining: [{ cardId: 'CATA_497', count: 1 }],
        extraRemaining: [],
        extras: [],
        knownPositions: [],
      },
      extraDisplay: {
        counters: { heraldCountThisGame: 2 },
        pools: {
          friendlyDeadDemonsThisGameUnique: [],
          friendlyDeadMinionsThisGameUnique: [],
        },
        friendlyBoard: [],
      },
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<OverlayView />);

    expect(screen.getByTestId('tracker-tab-deck')).toHaveAttribute('aria-selected', 'true');
    const heraldChip = screen.getByTestId('herald-counter-chip');
    expect(heraldChip).toBeVisible();
    expect(heraldChip).toHaveTextContent('兆示 2');
  });
});
