import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OpponentOverlayView } from '../src/components/OpponentOverlayView';
import { useDeckTrackerStore } from '../src/stores/deck-tracker-store';
import type { DeckTrackerSnapshot, OpponentCardRecord } from '@hdt/core';

function makeSnapshot(
  opponentRevealed: OpponentCardRecord[] = [],
  opponentGraveyard: OpponentCardRecord[] = [],
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
    deck: {
      id: 1,
      name: 'Test Deck',
      original: [{ cardId: 'CS2_029', count: 2 }],
      remaining: [{ cardId: 'CS2_029', count: 2 }],
      extraRemaining: [],
      extras: [],
    },
    pendingDeckSelection: null,
    friendlyHand: [],
    friendlyHandExtras: [],
    opposingHandCount: 0,
    opponent: {
      revealed: opponentRevealed,
      graveyard: opponentGraveyard,
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
    error: null,
    updatedAt: Date.now(),
  };
}

const CARD_DEFS: Record<string, { name: string; cost?: number; rarity?: string }> = {
  CS2_029: { name: 'Fireball', cost: 4, rarity: 'COMMON' },
  CORE_CS1_130: { name: 'Holy Smite', cost: 1, rarity: 'COMMON' },
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

describe('OpponentOverlayView', () => {
  beforeEach(() => {
    (window as unknown as { hdt: unknown }).hdt = {
      cards: {
        findById: vi.fn(async (cardId: string) => CARD_DEFS[cardId] ?? null),
      },
      cardImages: {
        get: vi.fn().mockResolvedValue(null),
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

  it('does not mount LiveDeckPanel (the player panel lives in /overlay)', () => {
    useDeckTrackerStore.setState({ snapshot: makeSnapshot() });

    render(<OpponentOverlayView />);

    // The player overlay's compact deck list rows MUST NOT appear here.
    expect(screen.queryAllByTestId('card-compact-row')).toHaveLength(0);
    expect(screen.queryAllByTestId('card-copy-row')).toHaveLength(0);
  });

  it('does not mount the main-window Sidebar', () => {
    useDeckTrackerStore.setState({ snapshot: makeSnapshot() });

    render(<OpponentOverlayView />);

    // Sidebar nav items would expose role=navigation; opponent overlay route is bare.
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('renders an opponent panel container even when no cards have been revealed', () => {
    useDeckTrackerStore.setState({ snapshot: makeSnapshot() });

    const { container } = render(<OpponentOverlayView />);

    // The hosting BrowserWindow is now sized to the panel itself, so the
    // view is just a w-full h-full wrapper around OpponentCardsPanel.
    const root = container.firstChild as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(root?.className ?? '').toMatch(/w-full/);
    expect(root?.className ?? '').toMatch(/h-full/);
  });

  it('renders opponent graveyard records in the graveyard tab', async () => {
    const user = userEvent.setup();
    const graveyard: OpponentCardRecord[] = [
      { entityId: 48, cardId: 'CORE_CS1_130', zone: 'GRAVEYARD', order: 2, created: false },
    ];
    useDeckTrackerStore.setState({ snapshot: makeSnapshot([], graveyard) });

    render(<OpponentOverlayView />);

    expect(screen.getByTestId('tracker-tab-graveyard-badge')).toHaveTextContent('1');
    await user.click(screen.getByTestId('tracker-tab-graveyard'));
    expect(screen.getByTestId('tracker-tab-graveyard')).toHaveAttribute('data-active', 'true');
    const row = screen.getByTestId('opponent-graveyard-row');
    expect(row).toHaveAttribute('data-card-id', 'CORE_CS1_130');
    expect(row).toHaveTextContent('Holy Smite');
  });
});
