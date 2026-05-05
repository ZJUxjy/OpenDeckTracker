import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveDeckPanel } from '../src/components/LiveDeckPanel';
import { useDeckTrackerStore } from '../src/stores/deck-tracker-store';
import type { DeckTrackerSnapshot } from '@hdt/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(overrides: {
  original: { cardId: string; count: number }[];
  remaining?: { cardId: string; count: number }[];
}): DeckTrackerSnapshot {
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
      original: overrides.original,
      remaining: overrides.remaining ?? overrides.original,
      extras: [],
    },
    pendingDeckSelection: null,
    friendlyHand: [],
    opposingHandCount: 0,
    opponent: {
      revealed: [],
      graveyard: [],
    },
    friendlyDeckCount: overrides.original.reduce((s, c) => s + c.count, 0),
    error: null,
    updatedAt: Date.now(),
  };
}

const CARD_DEFS: Record<string, { name: string; cost?: number; rarity?: string }> = {
  CS2_029: { name: 'Fireball', cost: 4, rarity: 'COMMON' },
  CS2_024: { name: 'Frostbolt', cost: 2, rarity: 'COMMON' },
  EX1_001: { name: 'Alexstrasza', cost: 9, rarity: 'LEGENDARY' },
  ALBATROSS: { name: 'Bad Luck Albatross', cost: 3, rarity: 'RARE' },
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LiveDeckPanel compact variant', () => {
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

  it('collapses copies into one row per cardId', () => {
    const snap = makeSnapshot({
      original: [
        { cardId: 'CS2_029', count: 2 }, // Fireball x2
        { cardId: 'CS2_024', count: 2 }, // Frostbolt x2
        { cardId: 'EX1_001', count: 1 }, // Alexstrasza x1
      ],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel compact />);

    const rows = screen.getAllByTestId('card-compact-row');
    // 3 unique cardIds, not 5 physical copies
    expect(rows).toHaveLength(3);
  });

  it('renders CardPips reflecting remaining vs original after a draw', () => {
    const original = [
      { cardId: 'CS2_029', count: 2 }, // Fireball x2
      { cardId: 'CS2_024', count: 2 }, // Frostbolt x2
    ];
    const snap = makeSnapshot({
      original,
      remaining: [
        { cardId: 'CS2_029', count: 1 }, // 1 drawn
        { cardId: 'CS2_024', count: 2 },
      ],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel compact />);

    // Fireball remaining=1,max=2 → 1 filled + 1 hollow
    // Frostbolt remaining=2,max=2 → 2 filled + 0 hollow
    // Total: 3 filled, 1 hollow
    expect(screen.getAllByTestId('pip-filled')).toHaveLength(3);
    expect(screen.getAllByTestId('pip-hollow')).toHaveLength(1);
  });

  it('dims rows with remaining=0 via opacity-40', () => {
    const snap = makeSnapshot({
      original: [
        { cardId: 'CS2_029', count: 2 },
        { cardId: 'CS2_024', count: 2 },
      ],
      remaining: [
        { cardId: 'CS2_029', count: 0 },
        { cardId: 'CS2_024', count: 2 },
      ],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel compact />);

    const rows = screen.getAllByTestId('card-compact-row');
    expect(rows).toHaveLength(2);
    // Fireball row (remaining=0) should be dimmed
    const fireballRow = rows.find((r) => r.textContent?.includes('Fireball'));
    expect(fireballRow).toBeTruthy();
    expect(fireballRow!.className).toContain('opacity-40');
  });

  it('does not apply animate-deck-exit in compact branch', () => {
    const original = [
      { cardId: 'CS2_029', count: 2 },
    ];
    const snapBefore = makeSnapshot({ original });
    useDeckTrackerStore.setState({ snapshot: snapBefore });

    const { rerender } = render(<LiveDeckPanel compact />);
    expect(screen.getAllByTestId('card-compact-row')).toHaveLength(1);

    // Draw one
    const snapAfter = makeSnapshot({
      original,
      remaining: [{ cardId: 'CS2_029', count: 1 }],
    });
    useDeckTrackerStore.setState({ snapshot: snapAfter });
    rerender(<LiveDeckPanel compact />);

    const rows = screen.getAllByTestId('card-compact-row');
    for (const row of rows) {
      expect(row.className).not.toContain('animate-deck-exit');
    }
  });

  it('tints compact row cost cells by rarity', () => {
    const snap = makeSnapshot({
      original: [
        { cardId: 'EX1_001', count: 1 }, // LEGENDARY → bg-rarity-legendary
        { cardId: 'ALBATROSS', count: 1 }, // RARE → bg-rarity-rare
      ],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel compact />);

    const rows = screen.getAllByTestId('card-compact-row');
    const alex = rows.find((r) => r.textContent?.includes('Alexstrasza'))!;
    const albatross = rows.find((r) => r.textContent?.includes('Bad Luck Albatross'))!;
    expect(alex.innerHTML).toContain('bg-rarity-legendary');
    expect(albatross.innerHTML).toContain('bg-rarity-rare');
  });

  it('renders one card-row-art img per compact row', () => {
    const snap = makeSnapshot({
      original: [
        { cardId: 'CS2_029', count: 2 },
        { cardId: 'EX1_001', count: 1 },
      ],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel compact />);

    const rows = screen.getAllByTestId('card-compact-row');
    const arts = screen.getAllByTestId('card-row-art');
    expect(rows).toHaveLength(2);
    expect(arts).toHaveLength(2);
  });

  it('uses the frame-less art URL (not the full-frame render URL nor the faded /tiles/ URL)', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CS2_029', count: 1 }],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel compact />);

    const art = screen.getAllByTestId('card-row-art')[0]! as HTMLImageElement;
    expect(art.src).toBe('https://art.hearthstonejson.com/v1/256x/CS2_029.jpg');
    expect(art.src).not.toContain('/render/');
    expect(art.src).not.toContain('/tiles/');
  });

  it('keeps the portrait img on spent rows under the opacity-40 wrapper', () => {
    const snap = makeSnapshot({
      original: [
        { cardId: 'CS2_029', count: 2 },
      ],
      remaining: [
        { cardId: 'CS2_029', count: 0 },
      ],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel compact />);

    const row = screen.getAllByTestId('card-compact-row')[0]!;
    expect(row.className).toContain('opacity-40');
    const art = row.querySelector('[data-testid="card-row-art"]');
    expect(art).toBeTruthy();
  });

  it('desktop variant still renders per-copy rows on the same fixture', () => {
    const snap = makeSnapshot({
      original: [
        { cardId: 'CS2_029', count: 2 },
        { cardId: 'CS2_024', count: 2 },
        { cardId: 'EX1_001', count: 1 },
      ],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    // No compact prop — desktop variant
    render(<LiveDeckPanel />);

    const rows = screen.getAllByTestId('card-copy-row');
    // 5 physical copies, not 3
    expect(rows).toHaveLength(5);
  });
});
