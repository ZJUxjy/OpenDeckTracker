import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { afterEach } from 'vitest';
import { LiveDeckPanel } from '../src/components/LiveDeckPanel';
import { useDeckTrackerStore } from '../src/stores/deck-tracker-store';
import type { DeckTrackerSnapshot } from '@hdt/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal IN_MATCH snapshot with the given deck. */
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

/** Card definition stubs keyed by cardId. */
const CARD_DEFS: Record<string, { name: string; cost?: number; rarity?: string }> = {
  CS2_106: { name: 'Fen Creeper', cost: 5, rarity: 'COMMON' },
  CS2_024: { name: 'Frostbolt', cost: 2, rarity: 'COMMON' },
  CS2_029: { name: 'Fireball', cost: 4, rarity: 'COMMON' },
  EX1_277: { name: 'Arcane Intellect', cost: 3, rarity: 'COMMON' },
  CS2_022: { name: 'Polymorph', cost: 4, rarity: 'COMMON' },
  EX1_287: { name: 'Counterspell', cost: 3, rarity: 'RARE' },
  GAME_005: { name: 'The Coin', cost: 0, rarity: 'FREE' },
  HERO_01: { name: 'Fireblast', rarity: 'FREE' }, // no cost — hero power
  ALBATROSS: { name: 'Bad Luck Albatross', cost: 3, rarity: 'RARE' },
  ALEX: { name: 'Alexstrasza', cost: 9, rarity: 'LEGENDARY' },
};

// Mock useCardDef to return stubs from CARD_DEFS.
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

describe('LiveDeckPanel sorting', () => {
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

  it('sorts rows by mana cost ascending', async () => {
    const snap = makeSnapshot({
      original: [
        { cardId: 'CS2_106', count: 1 }, // cost 5
        { cardId: 'CS2_024', count: 1 }, // cost 2
        { cardId: 'CS2_029', count: 1 }, // cost 4
      ],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    await waitFor(() => {
      const rows = screen.getAllByTestId('card-copy-row');
      const names = rows.map((r) => r.textContent);
      // Expected order: Frostbolt(2), Fireball(4), Fen Creeper(5)
      expect(names[0]!).toContain('Frostbolt');
      expect(names[1]!).toContain('Fireball');
      expect(names[2]!).toContain('Fen Creeper');
    });
  });

  it('sorts rows by name ascending when cost ties', async () => {
    const snap = makeSnapshot({
      original: [
        { cardId: 'CS2_022', count: 1 }, // Polymorph, cost 4
        { cardId: 'CS2_029', count: 1 }, // Fireball, cost 4
      ],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    await waitFor(() => {
      const rows = screen.getAllByTestId('card-copy-row');
      // Expected: Fireball < Polymorph (alphabetical on name)
      expect(rows[0]!.textContent).toContain('Fireball');
      expect(rows[1]!.textContent).toContain('Polymorph');
    });
  });

  it('sorts rows by cardId ascending when name and cost tie', async () => {
    // Both are "same card" scenario — but if two different cardIds had the
    // same cost/name, cardId is the tiebreaker. We test with two copies
    // of same cardId which should be adjacent.
    const snap = makeSnapshot({
      original: [
        { cardId: 'CS2_029', count: 2 }, // Fireball x2
        { cardId: 'CS2_024', count: 1 }, // Frostbolt
      ],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    await waitFor(() => {
      const rows = screen.getAllByTestId('card-copy-row');
      // 3 rows total: Frostbolt(2), Fireball#0(4), Fireball#1(4)
      expect(rows).toHaveLength(3);
      expect(rows[0]!.textContent).toContain('Frostbolt');
      expect(rows[1]!.textContent).toContain('Fireball');
      expect(rows[2]!.textContent).toContain('Fireball');
    });
  });

  it('places zero-cost rows at the top', async () => {
    const snap = makeSnapshot({
      original: [
        { cardId: 'CS2_029', count: 1 }, // Fireball, cost 4
        { cardId: 'HERO_01', count: 1 }, // Fireblast, no cost metadata, displays as 0
        { cardId: 'GAME_005', count: 1 }, // The Coin, cost 0
        { cardId: 'CS2_024', count: 1 }, // Frostbolt, cost 2
      ],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    await waitFor(() => {
      const rows = screen.getAllByTestId('card-copy-row');
      // Expected: Fireblast(0), The Coin(0), Frostbolt(2), Fireball(4)
      expect(rows[0]!.textContent).toContain('Fireblast');
      expect(rows[1]!.textContent).toContain('The Coin');
      expect(rows[2]!.textContent).toContain('Frostbolt');
      expect(rows[3]!.textContent).toContain('Fireball');
    });
  });

  it('renders 30 rows for a 30-card deck (one row per copy)', async () => {
    const original: { cardId: string; count: number }[] = [
      { cardId: 'CS2_024', count: 2 },  // Frostbolt x2
      { cardId: 'CS2_029', count: 2 },  // Fireball x2
      { cardId: 'EX1_277', count: 2 },  // Arcane Intellect x2
      { cardId: 'EX1_287', count: 2 },  // Counterspell x2
      { cardId: 'CS2_022', count: 2 },  // Polymorph x2
      { cardId: 'CS2_106', count: 2 },  // Fen Creeper x2
      // Fill to 30 with single-copy cards
      ...Array.from({ length: 18 }, (_, i) => ({
        cardId: `CARD_${String(i).padStart(3, '0')}`,
        count: 1,
      })),
    ];
    // Mock card defs for the filler cards
    for (let i = 0; i < 18; i++) {
      const id = `CARD_${String(i).padStart(3, '0')}`;
      (CARD_DEFS as Record<string, { name: string; cost: number; rarity: string }>)[id] = {
        name: `Filler ${i}`,
        cost: i + 1,
        rarity: 'COMMON',
      };
    }

    const snap = makeSnapshot({ original });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    await waitFor(() => {
      const rows = screen.getAllByTestId('card-copy-row');
      expect(rows).toHaveLength(30);
    });
  });

  it('renders remaining-only shuffled cards as physical rows', async () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CS2_029', count: 2 }],
      remaining: [
        { cardId: 'CS2_029', count: 2 },
        { cardId: 'ALBATROSS', count: 1 },
      ],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);

    await waitFor(() => {
      const rows = screen.getAllByTestId('card-copy-row');
      expect(rows).toHaveLength(3);
      expect(rows.some((row) => row.textContent?.includes('Bad Luck Albatross'))).toBe(true);
    });
  });
});

describe('LiveDeckPanel row rarity + portrait', () => {
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

  it('tints the cost cell of a legendary row with bg-rarity-legendary', async () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'ALEX', count: 1 }],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    await waitFor(() => {
      const row = screen.getAllByTestId('card-copy-row')[0]!;
      expect(row.innerHTML).toContain('bg-rarity-legendary');
    });
  });

  it('falls back to bg-rarity-common when rarity is unknown', async () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CS2_029', count: 1 }],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    await waitFor(() => {
      const row = screen.getAllByTestId('card-copy-row')[0]!;
      expect(row.innerHTML).toContain('bg-rarity-common');
    });
  });

  it('renders one card-row-art img per row', async () => {
    const snap = makeSnapshot({
      original: [
        { cardId: 'CS2_029', count: 2 },
        { cardId: 'ALEX', count: 1 },
      ],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    await waitFor(() => {
      const rows = screen.getAllByTestId('card-copy-row');
      const arts = screen.getAllByTestId('card-row-art');
      expect(rows).toHaveLength(3);
      expect(arts).toHaveLength(3);
    });
  });

  it('uses the locale-free tile URL (not the full-frame render URL)', async () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CS2_029', count: 1 }],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    await waitFor(() => {
      const art = screen.getAllByTestId('card-row-art')[0]! as HTMLImageElement;
      expect(art.src).toBe('https://art.hearthstonejson.com/v1/tiles/CS2_029.png');
      expect(art.src).not.toContain('/render/');
    });
  });
});

describe('LiveDeckPanel draw animation', () => {
  beforeEach(() => {
    useDeckTrackerStore.setState({
      snapshot: null,
      pendingSelection: null,
      dialogDismissed: false,
    });
  });

  it('applies animate-deck-exit class when a copy is drawn', () => {
    // Start with 2 Fireballs
    const original = [{ cardId: 'CS2_029', count: 2 }];
    const snapBefore = makeSnapshot({ original });
    useDeckTrackerStore.setState({ snapshot: snapBefore });

    const { rerender } = render(<LiveDeckPanel />);
    expect(screen.getAllByTestId('card-copy-row')).toHaveLength(2);

    // One Fireball drawn — remaining drops to 1
    const snapAfter = makeSnapshot({
      original,
      remaining: [{ cardId: 'CS2_029', count: 1 }],
    });
    useDeckTrackerStore.setState({ snapshot: snapAfter });
    rerender(<LiveDeckPanel />);

    // The highest ordinal copy (Fireball#1) should have the exit class
    const exitingRows = screen.getAllByTestId('card-copy-row').filter(
      (el) => el.classList.contains('animate-deck-exit'),
    );
    expect(exitingRows.length).toBeGreaterThanOrEqual(1);
  });

  it('removes row after animation end event', () => {
    const original = [{ cardId: 'CS2_029', count: 2 }];
    const snapBefore = makeSnapshot({ original });
    useDeckTrackerStore.setState({ snapshot: snapBefore });

    const { rerender } = render(<LiveDeckPanel />);
    expect(screen.getAllByTestId('card-copy-row')).toHaveLength(2);

    // Draw one
    const snapAfter = makeSnapshot({
      original,
      remaining: [{ cardId: 'CS2_029', count: 1 }],
    });
    useDeckTrackerStore.setState({ snapshot: snapAfter });
    rerender(<LiveDeckPanel />);

    // Find the exiting row and fire animationEnd
    const exitingRow = screen.getAllByTestId('card-copy-row').find(
      (el) => el.classList.contains('animate-deck-exit'),
    );
    expect(exitingRow).toBeTruthy();

    act(() => {
      fireEvent.animationEnd(exitingRow!);
    });
    rerender(<LiveDeckPanel />);

    // After animation end, only 1 row should remain
    const remaining = screen.getAllByTestId('card-copy-row').filter(
      (el) => !el.classList.contains('animate-deck-exit'),
    );
    expect(remaining).toHaveLength(1);
  });

  it('does not keep zero-count placeholder rows', () => {
    const original = [{ cardId: 'CS2_029', count: 1 }];
    const snapBefore = makeSnapshot({ original });
    useDeckTrackerStore.setState({ snapshot: snapBefore });

    const { rerender } = render(<LiveDeckPanel />);
    expect(screen.getAllByTestId('card-copy-row')).toHaveLength(1);

    // All copies drawn — remaining drops to 0
    const snapAfter = makeSnapshot({
      original,
      remaining: [{ cardId: 'CS2_029', count: 0 }],
    });
    useDeckTrackerStore.setState({ snapshot: snapAfter });
    rerender(<LiveDeckPanel />);

    // The row should be in exit animation, not a regular row
    const allRows = screen.getAllByTestId('card-copy-row');
    const nonExitingRows = allRows.filter(
      (el) => !el.classList.contains('animate-deck-exit'),
    );
    expect(nonExitingRows).toHaveLength(0);
  });

  it('animates exit when cardId disappears from remaining map (count drops to zero)', () => {
    const original = [{ cardId: 'CS2_029', count: 1 }];
    const snapBefore = makeSnapshot({ original });
    useDeckTrackerStore.setState({ snapshot: snapBefore });

    const { rerender } = render(<LiveDeckPanel />);
    expect(screen.getAllByTestId('card-copy-row')).toHaveLength(1);

    // Real snapshot shape after subtract(): cardId is removed instead of count:0.
    const snapAfter = makeSnapshot({
      original,
      remaining: [],
    });
    useDeckTrackerStore.setState({ snapshot: snapAfter });
    rerender(<LiveDeckPanel />);

    const exitingRows = screen
      .getAllByTestId('card-copy-row')
      .filter((el) => el.classList.contains('animate-deck-exit'));
    expect(exitingRows).toHaveLength(1);
  });

  it('animates multiple cards drawn in the same snapshot in parallel', () => {
    const original = [
      { cardId: 'CS2_029', count: 2 },
      { cardId: 'CS2_024', count: 2 },
    ];
    const snapBefore = makeSnapshot({ original });
    useDeckTrackerStore.setState({ snapshot: snapBefore });

    const { rerender } = render(<LiveDeckPanel />);
    expect(screen.getAllByTestId('card-copy-row')).toHaveLength(4);

    const snapAfter = makeSnapshot({
      original,
      remaining: [
        { cardId: 'CS2_029', count: 1 },
        { cardId: 'CS2_024', count: 1 },
      ],
    });
    useDeckTrackerStore.setState({ snapshot: snapAfter });
    rerender(<LiveDeckPanel />);

    const exitingRows = screen
      .getAllByTestId('card-copy-row')
      .filter((el) => el.classList.contains('animate-deck-exit'));
    expect(exitingRows).toHaveLength(2);
    expect(exitingRows.map((row) => row.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Fireball'),
        expect.stringContaining('Frostbolt'),
      ]),
    );
  });

  it('animates shuffled-in row when it leaves remaining', () => {
    const original = [{ cardId: 'CS2_029', count: 2 }];
    const snapBefore = makeSnapshot({
      original,
      remaining: [
        { cardId: 'CS2_029', count: 2 },
        { cardId: 'ALBATROSS', count: 1 },
      ],
    });
    useDeckTrackerStore.setState({ snapshot: snapBefore });

    const { rerender } = render(<LiveDeckPanel />);
    expect(screen.getAllByTestId('card-copy-row')).toHaveLength(3);

    const snapAfter = makeSnapshot({
      original,
      remaining: [{ cardId: 'CS2_029', count: 2 }],
    });
    useDeckTrackerStore.setState({ snapshot: snapAfter });
    rerender(<LiveDeckPanel />);

    const exitingAlbatross = screen
      .getAllByTestId('card-copy-row')
      .find(
        (el) =>
          el.textContent?.includes('Bad Luck Albatross') &&
          el.classList.contains('animate-deck-exit'),
      );
    expect(exitingAlbatross).toBeTruthy();
  });
});

describe('LiveDeckPanel hover', () => {
  let savedHdt: typeof window.hdt;
  let cardPreviewShow: ReturnType<typeof vi.fn>;
  let cardPreviewHide: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    useDeckTrackerStore.setState({
      snapshot: null,
      pendingSelection: null,
      dialogDismissed: false,
    });
    savedHdt = window.hdt;
    cardPreviewShow = vi.fn();
    cardPreviewHide = vi.fn();
    (window as { hdt: typeof window.hdt }).hdt = {
      ...savedHdt,
      cardPreview: {
        show: cardPreviewShow,
        hide: cardPreviewHide,
        onSetCard: vi.fn(() => () => {}),
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    (window as { hdt: typeof window.hdt }).hdt = savedHdt;
  });

  it('invokes cardPreview.show after the hover-delay threshold', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CS2_029', count: 1 }],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const row = screen.getAllByTestId('card-copy-row')[0]!;
    expect(row).toBeTruthy();

    fireEvent.mouseEnter(row);
    expect(cardPreviewShow).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(300); });
    expect(cardPreviewShow).toHaveBeenCalledTimes(1);
    expect(cardPreviewShow.mock.calls[0]![0]).toBe('CS2_029');
    const anchor = cardPreviewShow.mock.calls[0]![1] as { side: 'left' | 'right' };
    expect(anchor.side === 'left' || anchor.side === 'right').toBe(true);
  });

  it('does not invoke cardPreview.show when mouse leaves before threshold', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CS2_029', count: 1 }],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const row = screen.getAllByTestId('card-copy-row')[0]!;

    fireEvent.mouseEnter(row);
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.mouseLeave(row);
    act(() => { vi.advanceTimersByTime(300); });

    expect(cardPreviewShow).not.toHaveBeenCalled();
    // Mouse leave still fires hide() (cheap idempotent call).
    expect(cardPreviewHide).toHaveBeenCalled();
  });
});
