import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach } from 'vitest';
import { LiveDeckPanel } from '../src/components/LiveDeckPanel';
import { useDeckTrackerStore } from '../src/stores/deck-tracker-store';
import type {
  ActiveEffect,
  DeckTrackerSnapshot,
  KnownDeckPosition,
} from '@hdt/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal IN_MATCH snapshot with the given deck. */
function makeSnapshot(overrides: {
  original: { cardId: string; count: number }[];
  remaining?: { cardId: string; count: number }[];
  extraRemaining?: { cardId: string; count: number }[];
  knownPositions?: KnownDeckPosition[];
  friendlyHand?: string[];
  friendlyHandExtras?: boolean[];
  boardAttack?: DeckTrackerSnapshot['boardAttack'];
  opposingHero?: DeckTrackerSnapshot['opposingHero'];
  extraDisplay?: DeckTrackerSnapshot['extraDisplay'];
  friendlyEffects?: ActiveEffect[];
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
      extraRemaining: overrides.extraRemaining ?? [],
      extras: [],
      knownPositions: overrides.knownPositions ?? [],
    },
    pendingDeckSelection: null,
    friendlyHand: overrides.friendlyHand ?? [],
    friendlyHandExtras:
      overrides.friendlyHandExtras ?? (overrides.friendlyHand ?? []).map(() => false),
    opposingHandCount: 0,
    opponent: {
      revealed: [],
      graveyard: [],
    },
    opponentClass: null,
    friendlyGraveyard: [],
    extraDisplay: overrides.extraDisplay ?? {
      counters: {},
      pools: {
        friendlyDeadDemonsThisGameUnique: [],
        friendlyDeadMinionsThisGameUnique: [],
      },
      friendlyBoard: [],
    },
    friendlyDeckCount: overrides.original.reduce((s, c) => s + c.count, 0),
    friendlyEffects: overrides.friendlyEffects ?? [],
    opposingEffects: [],
    boardAttack: overrides.boardAttack ?? { friendly: 0, opposing: 0 },
    boardAttackToFace: overrides.boardAttack ?? { friendly: 0, opposing: 0 },
    friendlyHero: null,
    opposingHero: overrides.opposingHero ?? null,
    playerClass: null,
    error: null,
    updatedAt: Date.now(),
  };
}

/** Card definition stubs keyed by cardId. */
const CARD_DEFS: Record<
  string,
  {
    name: string;
    cost?: number;
    rarity?: string;
    type?: string;
    spellSchool?: string;
    races?: string[];
  }
> = {
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
  COST1: { name: 'Middle Card', cost: 1, rarity: 'COMMON' },
  COST5: { name: 'Right Card', cost: 5, rarity: 'COMMON' },
  COST10: { name: 'Left Card', cost: 10, rarity: 'COMMON' },
  CORE_BT_427: { name: 'Soul Feast', cost: 1, rarity: 'RARE', type: 'SPELL' },
  CATA_529: { name: 'Felfused Fel-Fisher', cost: 6, rarity: 'RARE', type: 'MINION' },
  TIME_714: { name: 'Time Lord Ebonok', cost: 6, rarity: 'LEGENDARY', type: 'MINION' },
  OPP_LAST_A: { name: 'Opponent Last Turn A', cost: 3, rarity: 'COMMON', type: 'MINION' },
  OPP_LAST_B: { name: 'Opponent Last Turn B', cost: 4, rarity: 'COMMON', type: 'MINION' },
  CATA_527: { name: 'Nespirah', cost: 3, rarity: 'LEGENDARY', type: 'LOCATION' },
  CATA_527t2: { name: 'Unburdened Nespirah', cost: 6, rarity: 'LEGENDARY', type: 'MINION' },
  FEL_SPELL: { name: 'Fel Spell', cost: 2, rarity: 'COMMON', type: 'SPELL', spellSchool: 'FEL' },
  NATURE_SPELL: {
    name: 'Nature Spell',
    cost: 2,
    rarity: 'COMMON',
    type: 'SPELL',
    spellSchool: 'NATURE',
  },
  EDR_226: { name: 'Pet Trainer', cost: 4, rarity: 'RARE', type: 'MINION' },
  BEAST_CARD: { name: 'Deck Beast', cost: 2, rarity: 'COMMON', type: 'MINION', races: ['BEAST'] },
  DRAGON_CARD: { name: 'Deck Dragon', cost: 2, rarity: 'COMMON', type: 'MINION', races: ['DRAGON'] },
  CATA_560: { name: '直面托维尔', cost: 3, rarity: 'EPIC', type: 'SPELL' },
  NEW1_031: { name: '动物伙伴', cost: 3, rarity: 'FREE', type: 'SPELL' },
  CORE_NEW1_031: { name: '动物伙伴', cost: 3, rarity: 'FREE', type: 'SPELL' },
  NEW1_032: { name: '米莎', cost: 3, rarity: 'FREE', type: 'MINION', races: ['BEAST'] },
  NEW1_033: { name: '雷欧克', cost: 3, rarity: 'FREE', type: 'MINION', races: ['BEAST'] },
  NEW1_034: { name: '霍弗', cost: 3, rarity: 'FREE', type: 'MINION', races: ['BEAST'] },
  MEND_300: { name: '驯服宠物', cost: 1, rarity: 'COMMON', type: 'SPELL' },
  MEND_301: { name: '灵语猎手', cost: 4, rarity: 'FREE', type: 'MINION' },
  MEND_303: { name: '迁徙的雷象', cost: 3, rarity: 'RARE', type: 'MINION', races: ['BEAST'] },
  MEND_304: { name: '塔雅·陆行', cost: 5, rarity: 'LEGENDARY', type: 'MINION' },
  MEND_307: { name: '自由漫步', cost: 7, rarity: 'EPIC', type: 'SPELL' },
  EDR_853: { name: '布罗尔·熊皮', cost: 4, rarity: 'LEGENDARY', type: 'MINION' },
  OG_211: { name: '兽群呼唤', cost: 8, rarity: 'EPIC', type: 'SPELL' },
  CORE_OG_211: { name: '兽群呼唤', cost: 8, rarity: 'EPIC', type: 'SPELL' },
  TIME_609: { name: '游侠将军希尔瓦娜斯', cost: 3, rarity: 'LEGENDARY', type: 'MINION' },
  TIME_609t1: { name: '游侠队长奥蕾莉亚', cost: 3, rarity: 'FREE', type: 'MINION' },
  TIME_609t2: { name: '游侠新兵温蕾萨', cost: 3, rarity: 'FREE', type: 'MINION' },
  BEAST_A: { name: 'Replacement Beast A', cost: 4, rarity: 'COMMON', type: 'MINION', races: ['BEAST'] },
  BEAST_B: { name: 'Replacement Beast B', cost: 4, rarity: 'COMMON', type: 'MINION', races: ['BEAST'] },
  BEAST_C: { name: 'Replacement Beast C', cost: 4, rarity: 'COMMON', type: 'MINION', races: ['BEAST'] },
  TIME_020t2: {
    name: '第一道阿古斯传送门',
    rarity: 'LEGENDARY',
    type: 'SPELL',
    spellSchool: 'FEL',
  },
  TIME_020t2t: { name: '奔逃的乌祖尔', cost: 1, rarity: 'COMMON', type: 'MINION' },
  TIME_020t3: {
    name: '第二道阿古斯传送门',
    rarity: 'LEGENDARY',
    type: 'SPELL',
    spellSchool: 'FEL',
  },
  TIME_020t3t: { name: '奔逃的夜魔', cost: 2, rarity: 'COMMON', type: 'MINION' },
  TIME_020t4: {
    name: '第三道阿古斯传送门',
    rarity: 'LEGENDARY',
    type: 'SPELL',
    spellSchool: 'FEL',
  },
  TIME_020t4t: { name: '奔逃的愤怒卫士', cost: 3, rarity: 'COMMON', type: 'MINION' },
  TIME_020t5: {
    name: '最后一道阿古斯传送门',
    rarity: 'LEGENDARY',
    type: 'SPELL',
    spellSchool: 'FEL',
  },
  TIME_020t5t: { name: '奔逃的恐惧卫士', cost: 4, rarity: 'COMMON', type: 'MINION' },
  TIME_443: { name: '怒火狱犬', cost: 4, rarity: 'RARE', type: 'SPELL' },
  TIME_443t: { name: '萨格拉斯的地狱犬', cost: 3, rarity: 'COMMON', type: 'MINION' },
  EDR_840: { name: '恐怖收割', cost: 2, rarity: 'FREE', type: 'SPELL' },
  EDR_840t1: { name: '鸦魔之种', cost: 1, rarity: 'COMMON', type: 'MINION' },
  EDR_840t: { name: '犬魔之种', cost: 2, rarity: 'COMMON', type: 'MINION' },
  EDR_840t2: { name: '蛇魔之种', cost: 3, rarity: 'COMMON', type: 'MINION' },
  TLC_902: { name: '虫害侵扰', cost: 2, rarity: 'RARE', type: 'SPELL' },
  TLC_630t: { name: '格里什毒刺虫', cost: 1, rarity: 'COMMON', type: 'SPELL' },
  TLC_903t: { name: '异种虫幼体', cost: 1, rarity: 'COMMON', type: 'MINION' },
  DINO_136: { name: '盛宴之角', cost: 4, rarity: 'FREE', type: 'SPELL' },
  DINO_136t: { name: '贪婪的迅猛龙', cost: 2, rarity: 'COMMON', type: 'MINION' },
  CORE_ICC_825: { name: '憎恶弓箭手', cost: 7, rarity: 'EPIC', type: 'MINION' },
  TLC_818: { name: '轮回转生', cost: 6, rarity: 'EPIC', type: 'SPELL' },
  CORE_AV_328: { name: '灵魂向导', cost: 5, rarity: 'FREE', type: 'MINION' },
  CATA_584: { name: '喷发火山', cost: 3, rarity: 'RARE', type: 'LOCATION' },
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
      type: def.type ?? 'SPELL',
      ...(def.spellSchool ? { spellSchool: def.spellSchool } : {}),
      ...(def.races ? { races: def.races } : {}),
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
            type: def.type ?? 'SPELL',
            ...(def.spellSchool ? { spellSchool: def.spellSchool } : {}),
            ...(def.races ? { races: def.races } : {}),
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
      { cardId: 'CS2_024', count: 2 }, // Frostbolt x2
      { cardId: 'CS2_029', count: 2 }, // Fireball x2
      { cardId: 'EX1_277', count: 2 }, // Arcane Intellect x2
      { cardId: 'EX1_287', count: 2 }, // Counterspell x2
      { cardId: 'CS2_022', count: 2 }, // Polymorph x2
      { cardId: 'CS2_106', count: 2 }, // Fen Creeper x2
      // Fill to 30 with single-copy cards
      ...Array.from({ length: 18 }, (_, i) => ({
        cardId: `CARD_${String(i).padStart(3, '0')}`,
        count: 1,
      })),
    ];
    // Mock card defs for the filler cards
    for (let i = 0; i < 18; i++) {
      const id = `CARD_${String(i).padStart(3, '0')}`;
      CARD_DEFS[id] = {
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
      extraRemaining: [{ cardId: 'ALBATROSS', count: 1 }],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);

    await waitFor(() => {
      const rows = within(screen.getByTestId('remaining-cards-section')).getAllByTestId('card-copy-row');
      expect(rows).toHaveLength(3);
      expect(rows.some((row) => row.textContent?.includes('Bad Luck Albatross'))).toBe(true);
      const albatrossRow = rows.find((row) => row.textContent?.includes('Bad Luck Albatross'));
      expect(albatrossRow).toBeDefined();
      expect(within(albatrossRow!).getByTestId('card-extra-origin-icon')).toBeInTheDocument();
      for (const row of rows.filter((candidate) => candidate.textContent?.includes('Fireball'))) {
        expect(within(row).queryByTestId('card-extra-origin-icon')).not.toBeInTheDocument();
      }
    });
  });

  it('marks only the overflow copy when an extra card shares an original card id', async () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CS2_029', count: 2 }],
      remaining: [{ cardId: 'CS2_029', count: 3 }],
      extraRemaining: [{ cardId: 'CS2_029', count: 1 }],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);

    await waitFor(() => {
      const rows = within(screen.getByTestId('remaining-cards-section')).getAllByTestId('card-copy-row');
      expect(rows).toHaveLength(3);
      expect(
        rows.filter((row) => within(row).queryByTestId('card-extra-origin-icon') !== null),
      ).toHaveLength(1);
    });
  });

  it('renders friendly hand below remaining cards in hand order', async () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CS2_029', count: 1 }],
      friendlyHand: ['COST10', 'COST1', 'COST5'],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);

    await waitFor(() => {
      expect(screen.getByText('Current Hand')).toBeInTheDocument();
      const remainingSection = screen.getByTestId('remaining-cards-section');
      const handSection = screen.getByTestId('friendly-hand-section');
      expect(
        remainingSection.compareDocumentPosition(handSection) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        within(handSection)
          .getAllByTestId('friendly-hand-row')
          .map((row) => row.textContent),
      ).toEqual([
        expect.stringContaining('Left Card'),
        expect.stringContaining('Middle Card'),
        expect.stringContaining('Right Card'),
      ]);
      for (const row of within(handSection).getAllByTestId('friendly-hand-row')) {
        expect(within(row).getByTestId('card-row-art')).toBeInTheDocument();
      }
    });
  });

  it('marks extra friendly hand cards with a gift icon', async () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CS2_029', count: 1 }],
      friendlyHand: ['CS2_029', 'ALBATROSS'],
      friendlyHandExtras: [false, true],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);

    await waitFor(() => {
      const handRows = within(screen.getByTestId('friendly-hand-section')).getAllByTestId(
        'friendly-hand-row',
      );
      expect(handRows).toHaveLength(2);
      expect(within(handRows[0]!).queryByTestId('card-extra-origin-icon')).not.toBeInTheDocument();
      expect(within(handRows[1]!).getByTestId('card-extra-origin-icon')).toBeInTheDocument();
    });
  });

  it('keeps remaining deck sort separate from hand order', async () => {
    const snap = makeSnapshot({
      original: [
        { cardId: 'COST10', count: 1 },
        { cardId: 'COST1', count: 1 },
        { cardId: 'COST5', count: 1 },
      ],
      friendlyHand: ['COST10', 'COST1', 'COST5'],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);

    await waitFor(() => {
      const deckRows = within(screen.getByTestId('remaining-cards-section'))
        .getAllByTestId('card-copy-row')
        .map((row) => row.textContent);
      expect(deckRows).toEqual([
        expect.stringContaining('Middle Card'),
        expect.stringContaining('Right Card'),
        expect.stringContaining('Left Card'),
      ]);

      const handRows = within(screen.getByTestId('friendly-hand-section'))
        .getAllByTestId('friendly-hand-row')
        .map((row) => row.textContent);
      expect(handRows).toEqual([
        expect.stringContaining('Left Card'),
        expect.stringContaining('Middle Card'),
        expect.stringContaining('Right Card'),
      ]);
    });
  });

  it('does not render reviewed extra-display counters directly on rows', async () => {
    const snap = makeSnapshot({
      original: [
        { cardId: 'CATA_529', count: 1 },
        { cardId: 'CORE_BT_427', count: 1 },
      ],
      friendlyHand: ['CORE_BT_427'],
      extraDisplay: {
        counters: {
          felSpellsCastThisGame: 3,
          friendlyMinionsDiedThisTurn: 2,
        },
        pools: {
          friendlyDeadDemonsThisGameUnique: [],
          friendlyDeadMinionsThisGameUnique: [],
          friendlyGraveyardThisTurn: [{ cardId: 'DEAD_MINION', count: 2 }],
        },
        friendlyBoard: [],
      },
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);

    await waitFor(() => {
      expect(screen.queryByText('3费')).not.toBeInTheDocument();
      expect(screen.queryByText('死 2')).not.toBeInTheDocument();
      expect(
        screen.queryByText('本局已施放邪能法术：3；费用减少 3；当前费用 3'),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('本回合友方随从死亡：2；预计抽牌：2')).not.toBeInTheDocument();
      expect(screen.queryByTestId('card-extra-display-badge')).not.toBeInTheDocument();
    });
  });

  it('marks reviewed deck-pool candidates for hover preview without inline text', async () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'EDR_226', count: 1 }],
      extraDisplay: {
        counters: {},
        pools: {
          friendlyDeadDemonsThisGameUnique: [],
          friendlyDeadMinionsThisGameUnique: [],
          beastsRemainingInDeck: [{ cardId: 'BEAST_CARD', count: 2 }],
        },
        friendlyBoard: [],
      },
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);

    await waitFor(() => {
      const row = screen.getAllByTestId('card-copy-row')[0]!;
      expect(row).toHaveAttribute('data-extra-display', 'active');
      expect(row).toHaveAttribute('data-extra-preview', 'pool');
      expect(screen.queryByText('池 2')).not.toBeInTheDocument();
      expect(screen.queryByText('牌库中可抽野兽：BEAST_CARD x2（2）')).not.toBeInTheDocument();
    });
  });

  it('highlights Fel spells when a friendly Fel trigger is on board', async () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'FEL_SPELL', count: 1 }],
      friendlyHand: ['FEL_SPELL'],
      extraDisplay: {
        counters: {},
        pools: {
          friendlyDeadDemonsThisGameUnique: [],
          friendlyDeadMinionsThisGameUnique: [],
        },
        friendlyBoard: [
          {
            entityId: 100,
            cardId: 'CATA_527',
            zone: 'PLAY',
            order: 1,
            created: false,
          },
        ],
      },
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);

    await waitFor(() => {
      const handRow = within(screen.getByTestId('friendly-hand-section')).getAllByTestId(
        'friendly-hand-row',
      )[0]!;
      expect(handRow).toHaveAttribute('data-extra-display', 'active');
      expect(within(handRow).queryByText('邪能')).not.toBeInTheDocument();
      expect(handRow).not.toHaveTextContent('将触发：奈瑟匹拉，蒙难古灵');
    });
  });

  it('highlights Nature spells when a friendly Nature trigger is on board', async () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'NATURE_SPELL', count: 1 }],
      friendlyHand: ['NATURE_SPELL'],
      extraDisplay: {
        counters: {},
        pools: {
          friendlyDeadDemonsThisGameUnique: [],
          friendlyDeadMinionsThisGameUnique: [],
        },
        friendlyBoard: [
          {
            entityId: 101,
            cardId: 'CORE_REV_314',
            zone: 'PLAY',
            order: 1,
            created: false,
          },
        ],
      },
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);

    await waitFor(() => {
      const handRow = within(screen.getByTestId('friendly-hand-section')).getAllByTestId(
        'friendly-hand-row',
      )[0]!;
      expect(handRow).toHaveAttribute('data-extra-display', 'active');
      expect(within(handRow).queryByText('自然')).not.toBeInTheDocument();
      expect(handRow).not.toHaveTextContent('将触发：灌木巨龙托匹奥');
    });
  });

  it('highlights friendly board attack in green when it is below opposing hero effective health', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CS2_029', count: 1 }],
      boardAttack: { friendly: 7, opposing: 0 },
      opposingHero: { health: 10, armor: 2, effectiveHealth: 12 },
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);

    const card = screen.getByTestId('friendly-board-attack-card');
    expect(card).toHaveClass('text-green');
    expect(screen.getByTestId('friendly-board-attack-value')).toHaveTextContent('7');
    expect(card).toHaveTextContent('/ 12');
  });

  it('highlights friendly board attack in red when it is lethal', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CS2_029', count: 1 }],
      boardAttack: { friendly: 12, opposing: 0 },
      opposingHero: { health: 10, armor: 2, effectiveHealth: 12 },
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);

    expect(screen.getByTestId('friendly-board-attack-card')).toHaveClass('text-red');
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
            type: def.type ?? 'SPELL',
            ...(def.spellSchool ? { spellSchool: def.spellSchool } : {}),
            collectible: true,
          };
        }),
      },
      cardImages: {
        getTile: vi.fn(async (cardId: string) => ({
          url: `hdt-card-image://tile/${cardId}.png`,
        })),
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

  it('routes the row art through the local cache protocol (never a CDN URL)', async () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CS2_029', count: 1 }],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    await waitFor(() => {
      const art = screen.getAllByTestId('card-row-art')[0]! as HTMLImageElement;
      expect(art.src).toBe('hdt-card-image://tile/CS2_029.png');
      expect(art.src).not.toContain('art.hearthstonejson.com');
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
    const exitingRows = screen
      .getAllByTestId('card-copy-row')
      .filter((el) => el.classList.contains('animate-deck-exit'));
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
    const exitingRow = screen
      .getAllByTestId('card-copy-row')
      .find((el) => el.classList.contains('animate-deck-exit'));
    expect(exitingRow).toBeTruthy();

    act(() => {
      fireEvent.animationEnd(exitingRow!);
    });
    rerender(<LiveDeckPanel />);

    // After animation end, only 1 row should remain
    const remaining = screen
      .getAllByTestId('card-copy-row')
      .filter((el) => !el.classList.contains('animate-deck-exit'));
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
    const nonExitingRows = allRows.filter((el) => !el.classList.contains('animate-deck-exit'));
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
  let cardPreviewShowPool: ReturnType<typeof vi.fn>;
  let cardPreviewShowEnhancedPool: ReturnType<typeof vi.fn>;
  let cardPreviewShowExtra: ReturnType<typeof vi.fn>;
  let cardPreviewShowEnhancedExtra: ReturnType<typeof vi.fn>;
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
    cardPreviewShowPool = vi.fn();
    cardPreviewShowEnhancedPool = vi.fn();
    cardPreviewShowExtra = vi.fn();
    cardPreviewShowEnhancedExtra = vi.fn();
    cardPreviewHide = vi.fn();
    (window as { hdt: typeof window.hdt }).hdt = {
      ...savedHdt,
      cardPreview: {
        show: cardPreviewShow,
        showPool: cardPreviewShowPool,
        showEnhancedPool: cardPreviewShowEnhancedPool,
        showExtra: cardPreviewShowExtra,
        showEnhancedExtra: cardPreviewShowEnhancedExtra,
        hide: cardPreviewHide,
        onSetCard: vi.fn(() => () => {}),
        onSetPool: vi.fn(() => () => {}),
        onSetEnhancedPool: vi.fn(() => () => {}),
        onSetExtra: vi.fn(() => () => {}),
        onSetEnhancedExtra: vi.fn(() => () => {}),
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

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(cardPreviewShow).toHaveBeenCalledTimes(1);
    expect(cardPreviewShow.mock.calls[0]![0]).toBe('CS2_029');
    const anchor = cardPreviewShow.mock.calls[0]![1] as { side: 'left' | 'right' };
    expect(anchor.side === 'left' || anchor.side === 'right').toBe(true);
    expect(cardPreviewShowPool).not.toHaveBeenCalled();
    expect(cardPreviewShowExtra).not.toHaveBeenCalled();
  });

  it('uses enhanced pool preview for 直面托维尔 one-cost replay candidates', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CATA_560', count: 1 }],
      extraDisplay: {
        counters: {},
        pools: {
          friendlyDeadDemonsThisGameUnique: [],
          friendlyDeadMinionsThisGameUnique: [],
          oneCostCardsPlayedThisGameDistinct: [{ cardId: 'MEND_300', count: 2 }],
        },
        friendlyBoard: [],
      },
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const row = screen.getAllByTestId('card-copy-row')[0]!;
    expect(row).toHaveAttribute('data-extra-preview', 'pool');

    fireEvent.mouseEnter(row);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(cardPreviewShow).not.toHaveBeenCalled();
    expect(cardPreviewShowPool).not.toHaveBeenCalled();
    expect(cardPreviewShowEnhancedPool).toHaveBeenCalledTimes(1);
    expect(cardPreviewShowEnhancedPool.mock.calls[0]![0]).toBe('CATA_560');
    expect(cardPreviewShowEnhancedPool.mock.calls[0]![1]).toEqual(['MEND_300', 'MEND_300']);
    const anchor = cardPreviewShowEnhancedPool.mock.calls[0]![2] as { side: 'left' | 'right' };
    expect(anchor.side === 'left' || anchor.side === 'right').toBe(true);
  });

  it('previews the default Animal Companion pool on Animal Companion hover', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'NEW1_031', count: 1 }],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const row = screen.getAllByTestId('card-copy-row')[0]!;
    expect(row).toHaveAttribute('data-extra-preview', 'pool');

    fireEvent.mouseEnter(row);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(cardPreviewShow).not.toHaveBeenCalled();
    expect(cardPreviewShowExtra).not.toHaveBeenCalled();
    expect(cardPreviewShowPool).not.toHaveBeenCalled();
    expect(cardPreviewShowEnhancedPool).toHaveBeenCalledTimes(1);
    expect(cardPreviewShowEnhancedPool.mock.calls[0]![0]).toBe('NEW1_031');
    expect(cardPreviewShowEnhancedPool.mock.calls[0]![1]).toEqual([
      'NEW1_032',
      'NEW1_033',
      'NEW1_034',
    ]);
  });

  it.each([
    'MEND_300',
    'MEND_301',
    'MEND_303',
    'MEND_304',
    'MEND_307',
    'CORE_NEW1_031',
    'OG_211',
    'CORE_OG_211',
    'EDR_853',
  ] as const)('previews the changed Animal Companion pool for %s', (cardId) => {
    const snap = makeSnapshot({
      original: [{ cardId, count: 1 }],
      friendlyEffects: [
        {
          id: 'roam-free',
          sourceCardId: 'MEND_307',
          triggeredAt: 200,
          triggerCount: 1,
          params: { pool: ['BEAST_A', 'BEAST_B', 'BEAST_C'] },
        },
      ],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const row = screen.getAllByTestId('card-copy-row')[0]!;
    expect(row).toHaveAttribute('data-extra-preview', 'pool');

    fireEvent.mouseEnter(row);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(cardPreviewShow).not.toHaveBeenCalled();
    expect(cardPreviewShowExtra).not.toHaveBeenCalled();
    expect(cardPreviewShowPool).not.toHaveBeenCalled();
    expect(cardPreviewShowEnhancedPool).toHaveBeenCalledTimes(1);
    expect(cardPreviewShowEnhancedPool.mock.calls[0]![0]).toBe(cardId);
    expect(cardPreviewShowEnhancedPool.mock.calls[0]![1]).toEqual([
      'BEAST_A',
      'BEAST_B',
      'BEAST_C',
    ]);
  });

  it('highlights Fel spells while hovering Nespirah and previews its deathrattle minion', async () => {
    const snap = makeSnapshot({
      original: [
        { cardId: 'FEL_SPELL', count: 1 },
        { cardId: 'CATA_527', count: 1 },
        { cardId: 'CS2_029', count: 1 },
      ],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const rows = screen.getAllByTestId('card-copy-row');
    expect(rows).toHaveLength(3);
    const felSpellRow = screen.getByText('Fel Spell').closest('[data-testid="card-copy-row"]')!;
    const nespirahRow = screen.getByText('Nespirah').closest('[data-testid="card-copy-row"]')!;
    const fireballRow = screen.getByText('Fireball').closest('[data-testid="card-copy-row"]')!;

    expect(felSpellRow).not.toHaveClass('ring-1');
    expect(nespirahRow).toHaveAttribute('data-extra-preview', 'pool');

    act(() => {
      fireEvent.mouseEnter(nespirahRow);
    });
    expect(felSpellRow).toHaveAttribute('data-extra-display', 'active');
    expect(felSpellRow).toHaveClass('ring-1');
    expect(fireballRow).not.toHaveClass('ring-1');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(cardPreviewShow).not.toHaveBeenCalled();
    expect(cardPreviewShowExtra).not.toHaveBeenCalled();
    expect(cardPreviewShowPool).not.toHaveBeenCalled();
    expect(cardPreviewShowEnhancedPool).toHaveBeenCalledTimes(1);
    expect(cardPreviewShowEnhancedPool.mock.calls[0]![0]).toBe('CATA_527');
    expect(cardPreviewShowEnhancedPool.mock.calls[0]![1]).toEqual(['CATA_527t2']);
  });

  it('previews already-played Ranger Sylvanas-family cards without prepending the hovered card', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'TIME_609t2', count: 1 }],
      extraDisplay: {
        counters: {},
        pools: {
          friendlyDeadDemonsThisGameUnique: [],
          friendlyDeadMinionsThisGameUnique: [],
          rangerSylvanasCardsPlayedThisGame: [
            { cardId: 'TIME_609t1', count: 1 },
            { cardId: 'TIME_609', count: 1 },
          ],
        },
        friendlyBoard: [],
      },
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const row = screen.getAllByTestId('card-copy-row')[0]!;
    expect(row).toHaveAttribute('data-extra-preview', 'pool');

    fireEvent.mouseEnter(row);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(cardPreviewShow).not.toHaveBeenCalled();
    expect(cardPreviewShowExtra).not.toHaveBeenCalled();
    expect(cardPreviewShowPool).not.toHaveBeenCalled();
    expect(cardPreviewShowEnhancedPool).toHaveBeenCalledTimes(1);
    expect(cardPreviewShowEnhancedPool.mock.calls[0]![0]).toBe('TIME_609t2');
    expect(cardPreviewShowEnhancedPool.mock.calls[0]![1]).toEqual(['TIME_609t1', 'TIME_609']);
  });

  it('highlights beast cards while hovering Strange Dog Trainer', () => {
    const snap = makeSnapshot({
      original: [
        { cardId: 'EDR_226', count: 1 },
        { cardId: 'BEAST_CARD', count: 1 },
        { cardId: 'DRAGON_CARD', count: 1 },
      ],
      extraDisplay: {
        counters: {},
        pools: {
          friendlyDeadDemonsThisGameUnique: [],
          friendlyDeadMinionsThisGameUnique: [],
          beastsRemainingInDeck: [{ cardId: 'BEAST_CARD', count: 1 }],
        },
        friendlyBoard: [],
      },
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const dogTrainerRow = screen.getByText('Pet Trainer').closest('[data-testid="card-copy-row"]')!;
    const beastRow = screen.getByText('Deck Beast').closest('[data-testid="card-copy-row"]')!;
    const dragonRow = screen.getByText('Deck Dragon').closest('[data-testid="card-copy-row"]')!;

    expect(beastRow).not.toHaveClass('ring-1');
    act(() => {
      fireEvent.mouseEnter(dogTrainerRow);
    });

    expect(beastRow).toHaveAttribute('data-extra-display', 'active');
    expect(beastRow).toHaveClass('ring-1');
    expect(dragonRow).not.toHaveClass('ring-1');
  });

  it('previews all First Argus Portal derived cards on hover', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'TIME_020t2', count: 1 }],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const row = screen.getAllByTestId('card-copy-row')[0]!;
    expect(row).toHaveAttribute('data-extra-preview', 'pool');

    fireEvent.mouseEnter(row);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(cardPreviewShow).not.toHaveBeenCalled();
    expect(cardPreviewShowExtra).not.toHaveBeenCalled();
    expect(cardPreviewShowPool).not.toHaveBeenCalled();
    expect(cardPreviewShowEnhancedPool).toHaveBeenCalledTimes(1);
    expect(cardPreviewShowEnhancedPool.mock.calls[0]![0]).toBe('TIME_020t2');
    expect(cardPreviewShowEnhancedPool.mock.calls[0]![1]).toEqual([
      'TIME_020t2t',
      'TIME_020t3',
      'TIME_020t3t',
      'TIME_020t4',
      'TIME_020t4t',
      'TIME_020t5',
      'TIME_020t5t',
    ]);
  });

  it.each([
    ['怒火狱犬', 'TIME_443', ['TIME_443t', 'TIME_443t']],
    ['恐怖收割', 'EDR_840', ['EDR_840t1', 'EDR_840t', 'EDR_840t2']],
    ['虫害侵扰', 'TLC_902', ['TLC_630t', 'TLC_630t', 'TLC_903t', 'TLC_903t']],
    ['盛宴之角', 'DINO_136', ['DINO_136t', 'DINO_136t', 'DINO_136t']],
  ] as const)('previews static derived cards for %s', (_name, cardId, expectedPool) => {
    const snap = makeSnapshot({
      original: [{ cardId, count: 1 }],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const row = screen.getAllByTestId('card-copy-row')[0]!;
    expect(row).toHaveAttribute('data-extra-preview', 'pool');

    fireEvent.mouseEnter(row);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(cardPreviewShow).not.toHaveBeenCalled();
    expect(cardPreviewShowExtra).not.toHaveBeenCalled();
    expect(cardPreviewShowPool).not.toHaveBeenCalled();
    expect(cardPreviewShowEnhancedPool).toHaveBeenCalledTimes(1);
    expect(cardPreviewShowEnhancedPool.mock.calls[0]![0]).toBe(cardId);
    expect(cardPreviewShowEnhancedPool.mock.calls[0]![1]).toEqual(expectedPool);
  });

  it('shows Ebonok last-turn destroy pool on hover with card previews', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'TIME_714', count: 1 }],
      extraDisplay: {
        counters: {},
        pools: {
          friendlyDeadDemonsThisGameUnique: [],
          friendlyDeadMinionsThisGameUnique: [],
          opponentMinionsPlayedLastTurnStillInPlay: [
            { cardId: 'OPP_LAST_A', count: 1 },
            { cardId: 'OPP_LAST_B', count: 1 },
          ],
        },
        friendlyBoard: [],
      },
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const row = screen.getAllByTestId('card-copy-row')[0]!;
    expect(row).toHaveAttribute('data-extra-preview', 'pool');

    fireEvent.mouseEnter(row);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(cardPreviewShowEnhancedPool).toHaveBeenCalledTimes(1);
    expect(cardPreviewShowEnhancedPool.mock.calls[0]![0]).toBe('TIME_714');
    expect(cardPreviewShowEnhancedPool.mock.calls[0]![1]).toEqual(['OPP_LAST_A', 'OPP_LAST_B']);
    expect(cardPreviewShowEnhancedExtra).not.toHaveBeenCalled();
  });

  it('highlights Ebonok when the destroy pool is empty', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'TIME_714', count: 1 }],
      extraDisplay: {
        counters: {},
        pools: {
          friendlyDeadDemonsThisGameUnique: [],
          friendlyDeadMinionsThisGameUnique: [],
          opponentMinionsPlayedLastTurnStillInPlay: [],
        },
        friendlyBoard: [],
      },
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const row = screen.getAllByTestId('card-copy-row')[0]!;
    expect(row).toHaveAttribute('data-extra-display', 'active');
    expect(row).toHaveClass('ring-1');
    expect(row).toHaveAttribute('data-extra-preview', 'extra');

    fireEvent.mouseEnter(row);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(cardPreviewShowEnhancedExtra).toHaveBeenCalledTimes(1);
    expect(cardPreviewShowEnhancedExtra.mock.calls[0]![1]).toEqual({
      title: 'Time Lord Ebonok',
      lines: ['可消灭：无'],
    });
  });

  it('shows cost-reduction hover text for giant-style cards even at zero progress', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CATA_529', count: 1 }],
      extraDisplay: {
        counters: {
          felSpellsCastThisGame: 2,
        },
        pools: {
          friendlyDeadDemonsThisGameUnique: [],
          friendlyDeadMinionsThisGameUnique: [],
        },
        friendlyBoard: [],
      },
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const row = screen.getAllByTestId('card-copy-row')[0]!;
    expect(row).toHaveAttribute('data-extra-preview', 'extra');

    fireEvent.mouseEnter(row);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(cardPreviewShowEnhancedExtra).toHaveBeenCalledTimes(1);
    expect(cardPreviewShowEnhancedExtra.mock.calls[0]![0]).toBe('CATA_529');
    expect(cardPreviewShowEnhancedExtra.mock.calls[0]![1]).toEqual({
      title: 'Felfused Fel-Fisher',
      lines: ['本局邪能法术：2；费用减少 2，当前费用 4'],
    });
  });

  it('uses enhanced text preview for counter-only candidates', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CORE_BT_427', count: 1 }],
      extraDisplay: {
        counters: {
          friendlyMinionsDiedThisTurn: 2,
        },
        pools: {
          friendlyDeadDemonsThisGameUnique: [],
          friendlyDeadMinionsThisGameUnique: [],
        },
        friendlyBoard: [],
      },
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const row = screen.getAllByTestId('card-copy-row')[0]!;
    expect(row).toHaveAttribute('data-extra-preview', 'extra');
    expect(row).not.toHaveTextContent('本回合友方随从死亡：2；预计抽牌：2');

    fireEvent.mouseEnter(row);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(cardPreviewShow).not.toHaveBeenCalled();
    expect(cardPreviewShowPool).not.toHaveBeenCalled();
    expect(cardPreviewShowExtra).not.toHaveBeenCalled();
    expect(cardPreviewShowEnhancedExtra).toHaveBeenCalledTimes(1);
    expect(cardPreviewShowEnhancedExtra.mock.calls[0]![0]).toBe('CORE_BT_427');
    expect(cardPreviewShowEnhancedExtra.mock.calls[0]![1]).toEqual({
      title: 'Soul Feast',
      lines: ['本回合友方随从死亡：2；预计抽牌：2'],
    });
  });

  it('keeps turn-condition candidates on text preview when their state also has a pool', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CATA_584', count: 1 }],
      extraDisplay: {
        counters: {
          fireSpellsCastThisTurnByYou: 1,
        },
        pools: {
          friendlyDeadDemonsThisGameUnique: [],
          friendlyDeadMinionsThisGameUnique: [],
          fireSpellsCastThisTurnByYou: [{ cardId: 'FIRE_SPELL', count: 1 }],
        },
        friendlyBoard: [],
      },
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const row = screen.getAllByTestId('card-copy-row')[0]!;
    expect(row).toHaveAttribute('data-extra-preview', 'extra');

    fireEvent.mouseEnter(row);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(cardPreviewShow).not.toHaveBeenCalled();
    expect(cardPreviewShowPool).not.toHaveBeenCalled();
    expect(cardPreviewShowExtra).not.toHaveBeenCalled();
    expect(cardPreviewShowEnhancedExtra).toHaveBeenCalledTimes(1);
    expect(cardPreviewShowEnhancedExtra.mock.calls[0]![0]).toBe('CATA_584');
    expect(cardPreviewShowEnhancedExtra.mock.calls[0]![1]).toEqual({
      title: '喷发火山',
      lines: ['本回合已施放火焰法术：是；当前伤害 6'],
    });
  });

  it('expands weighted graveyard pools by instance count', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CORE_ICC_825', count: 1 }],
      extraDisplay: {
        counters: {},
        pools: {
          friendlyDeadDemonsThisGameUnique: [],
          friendlyDeadMinionsThisGameUnique: [],
          friendlyDeadBeastsThisGameWeighted: [
            { cardId: 'BEAST_A', count: 2 },
            { cardId: 'BEAST_B', count: 1 },
          ],
        },
        friendlyBoard: [],
      },
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const row = screen.getAllByTestId('card-copy-row')[0]!;
    expect(row).toHaveAttribute('data-extra-preview', 'pool');

    fireEvent.mouseEnter(row);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(cardPreviewShow).not.toHaveBeenCalled();
    expect(cardPreviewShowExtra).not.toHaveBeenCalled();
    expect(cardPreviewShowPool).not.toHaveBeenCalled();
    expect(cardPreviewShowEnhancedPool).toHaveBeenCalledTimes(1);
    expect(cardPreviewShowEnhancedPool.mock.calls[0]![0]).toBe('CORE_ICC_825');
    expect(cardPreviewShowEnhancedPool.mock.calls[0]![1]).toEqual([
      'BEAST_A',
      'BEAST_A',
      'BEAST_B',
    ]);
  });

  it('uses text preview for multi-bucket graveyard pools', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'TLC_818', count: 1 }],
      extraDisplay: {
        counters: {},
        pools: {
          friendlyDeadDemonsThisGameUnique: [],
          friendlyDeadMinionsThisGameUnique: [],
          friendlyDeadMinionsCost1: [{ cardId: 'COST_ONE_DEAD', count: 2 }],
          friendlyDeadMinionsCost3: [{ cardId: 'COST_THREE_DEAD', count: 1 }],
        },
        friendlyBoard: [],
      },
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const row = screen.getAllByTestId('card-copy-row')[0]!;
    expect(row).toHaveAttribute('data-extra-preview', 'extra');

    fireEvent.mouseEnter(row);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(cardPreviewShow).not.toHaveBeenCalled();
    expect(cardPreviewShowPool).not.toHaveBeenCalled();
    expect(cardPreviewShowExtra).not.toHaveBeenCalled();
    expect(cardPreviewShowEnhancedExtra).toHaveBeenCalledTimes(1);
    expect(cardPreviewShowEnhancedExtra.mock.calls[0]![0]).toBe('TLC_818');
    expect(cardPreviewShowEnhancedExtra.mock.calls[0]![1]).toEqual({
      title: '轮回转生',
      lines: ['1费：COST_ONE_DEAD x2；2费：无；3费：COST_THREE_DEAD'],
    });
  });

  it('uses text preview for multi-school deck pools', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CORE_AV_328', count: 1 }],
      extraDisplay: {
        counters: {},
        pools: {
          friendlyDeadDemonsThisGameUnique: [],
          friendlyDeadMinionsThisGameUnique: [],
          holySpellsRemainingInDeck: [{ cardId: 'HOLY_DECK_SPELL', count: 1 }],
          shadowSpellsRemainingInDeck: [{ cardId: 'SHADOW_DECK_SPELL', count: 2 }],
        },
        friendlyBoard: [],
      },
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const row = screen.getAllByTestId('card-copy-row')[0]!;
    expect(row).toHaveAttribute('data-extra-preview', 'extra');

    fireEvent.mouseEnter(row);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(cardPreviewShow).not.toHaveBeenCalled();
    expect(cardPreviewShowPool).not.toHaveBeenCalled();
    expect(cardPreviewShowExtra).not.toHaveBeenCalled();
    expect(cardPreviewShowEnhancedExtra).toHaveBeenCalledTimes(1);
    expect(cardPreviewShowEnhancedExtra.mock.calls[0]![0]).toBe('CORE_AV_328');
    expect(cardPreviewShowEnhancedExtra.mock.calls[0]![1]).toEqual({
      title: '灵魂向导',
      lines: ['牌库剩余神圣法术 1 张 / 暗影法术 2 张'],
    });
  });

  it('does not invoke cardPreview.show when mouse leaves before threshold', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CS2_029', count: 1 }],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const row = screen.getAllByTestId('card-copy-row')[0]!;

    fireEvent.mouseEnter(row);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.mouseLeave(row);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(cardPreviewShow).not.toHaveBeenCalled();
    expect(cardPreviewShowExtra).not.toHaveBeenCalled();
    // Mouse leave still fires hide() (cheap idempotent call).
    expect(cardPreviewHide).toHaveBeenCalled();
  });

  it('renders a known-position badge on cards Waveshaping put at the bottom', () => {
    // CS2_029 has 2 copies remaining in the deck. The state machine
    // marked 1 of those as "bottom" via Waveshaping. The LAST physical
    // row (ordinal 1) should carry the badge; the earlier (ordinal 0)
    // should not.
    const snap = makeSnapshot({
      original: [{ cardId: 'CS2_029', count: 2 }],
      remaining: [{ cardId: 'CS2_029', count: 2 }],
      knownPositions: [
        {
          cardId: 'CS2_029',
          controllerId: 1,
          placement: 'bottom',
          insertedAt: 0,
          sourceCardId: 'TIME_701',
        },
      ],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    const badges = screen.getAllByTestId('card-known-position-icon');
    expect(badges).toHaveLength(1);
    expect(badges[0]!.getAttribute('data-placement')).toBe('bottom');
    expect(badges[0]!.getAttribute('aria-label')).toContain('TIME_701');
  });

  it('shows two badges when two copies of a card are bottom-marked', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CS2_029', count: 2 }],
      remaining: [{ cardId: 'CS2_029', count: 2 }],
      knownPositions: [
        {
          cardId: 'CS2_029',
          controllerId: 1,
          placement: 'bottom',
          insertedAt: 0,
          sourceCardId: 'TIME_701',
        },
        {
          cardId: 'CS2_029',
          controllerId: 1,
          placement: 'bottom',
          insertedAt: 1,
          sourceCardId: 'TIME_701',
        },
      ],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    expect(screen.getAllByTestId('card-known-position-icon')).toHaveLength(2);
  });

  it('renders no badge when knownPositions is empty', () => {
    const snap = makeSnapshot({
      original: [{ cardId: 'CS2_029', count: 2 }],
      remaining: [{ cardId: 'CS2_029', count: 2 }],
      knownPositions: [],
    });
    useDeckTrackerStore.setState({ snapshot: snap });

    render(<LiveDeckPanel />);
    expect(screen.queryByTestId('card-known-position-icon')).toBeNull();
  });
});
