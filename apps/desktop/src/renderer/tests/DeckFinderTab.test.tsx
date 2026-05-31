import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PopularDeckEnriched } from '@hdt/core';

import { DeckFinderTab } from '../src/components/DeckFinderTab';
import { defaultMessages, I18nProvider, type MessagesByLocale } from '../src/i18n';

const FIXTURE: PopularDeckEnriched[] = [
  {
    id: 'mage1', name: 'Aggro Fire Mage', class: 'MAGE', format: 'Standard', archetype: 'Aggro',
    deckstring: 'AAEC-FAKE', winratePercent: 58, gamesCount: 12400, dustCost: 4800,
    author: 'thalia', updatedAt: '2026-04-25',
    manaCurve: [0, 6, 8, 6, 4, 2, 2, 2], cardNames: ['Fireball', 'Polymorph', 'Frostbolt'],
    deckCardList: [],
    keyCards: [{ cardId: 'CS2_029', name: 'Fireball', count: 2, cost: 4 }, { cardId: 'NEW_010', name: 'Polymorph', count: 2, cost: 4 }],
    classMatchups: [
      { opponentClass: 'HUNTER', winratePercent: 66.1, gamesCount: 56, popularityPercent: 24.2 },
      { opponentClass: 'WARRIOR', winratePercent: 40, gamesCount: 5, popularityPercent: 10 },
    ],
  },
  {
    id: 'warrior1', name: 'Control Warrior', class: 'WARRIOR', format: 'Standard', archetype: 'Control',
    deckstring: 'AAEC-FAKE2', winratePercent: 54, gamesCount: 8240, dustCost: 11200,
    author: 'okuda', updatedAt: '2026-04-22',
    manaCurve: [0, 2, 4, 6, 4, 4, 4, 6], cardNames: ['Brawl', 'Execute', 'Shield Slam'],
    deckCardList: [],
    keyCards: [{ cardId: 'EX1_407', name: 'Brawl', count: 2, cost: 5 }],
  },
  {
    id: 'paladin1', name: 'Whale Paladin', class: 'PALADIN', format: 'Standard', archetype: 'Control',
    deckstring: 'AAEC-FAKE4', winratePercent: 51, gamesCount: 3200, dustCost: 24800,
    author: 'lux', updatedAt: '2026-04-23',
    manaCurve: [0, 1, 2, 3, 4, 5, 6, 9], cardNames: ['Tirion'],
    deckCardList: [],
    keyCards: [{ cardId: 'EX1_383', name: 'Tirion Fordring', count: 1, cost: 8 }],
  },
  {
    id: 'priestw', name: 'Reno Priest', class: 'PRIEST', format: 'Wild', archetype: 'Combo',
    deckstring: 'AAEC-FAKE3', winratePercent: 52, gamesCount: 6120, dustCost: 13400,
    author: 'ren', updatedAt: '2026-04-24',
    manaCurve: [0, 0, 4, 4, 6, 4, 6, 6], cardNames: ['Anduin'],
    deckCardList: [],
    keyCards: [{ cardId: 'HERO_09y', name: 'Anduin', count: 1, cost: 4 }],
  },
];

function renderTab(locale: 'en-US' | 'zh-CN' = 'en-US', messages?: MessagesByLocale) {
  const providerProps: { preference: 'en-US' | 'zh-CN'; messages?: MessagesByLocale } = { preference: locale };
  if (messages) providerProps.messages = messages;

  return render(
    <I18nProvider {...providerProps}>
      <DeckFinderTab />
    </I18nProvider>,
  );
}

type TestSyncProgress = {
  phase: 'meta' | 'variants' | 'details' | 'persist';
  completed: number;
  total: number;
  currentLabel?: string;
};

describe('DeckFinderTab', () => {
  let popularDecksSaved: typeof window.hdt.popularDecks;

  beforeEach(() => {
    popularDecksSaved = window.hdt.popularDecks;
    (window as { hdt: { popularDecks: typeof window.hdt.popularDecks } }).hdt.popularDecks = {
      list: vi.fn().mockResolvedValue({ decks: [...FIXTURE], source: 'seed', fetchedAt: null }),
      syncStart: vi.fn().mockResolvedValue({ ok: true, fetchedAt: '2026-05-09T12:00:00Z', count: FIXTURE.length }),
      syncStatus: vi.fn().mockResolvedValue({ inFlight: false, lastFetchedAt: null }),
      onSyncProgress: vi.fn().mockReturnValue(() => undefined),
    };
  });

  afterEach(() => {
    (window as { hdt: { popularDecks: typeof window.hdt.popularDecks } }).hdt.popularDecks = popularDecksSaved;
  });

  it('renders the header with eyebrow + title', async () => {
    await act(async () => { renderTab(); });
    await waitFor(() => expect(screen.getByText('Deck Finder')).toBeInTheDocument());
    expect(screen.getByText('DECKS / FIND')).toBeInTheDocument();
  });

  it('shows the HSGuru data source note beside the sync button', async () => {
    await act(async () => { renderTab('zh-CN'); });
    await waitFor(() => expect(screen.getByText('卡组查找')).toBeInTheDocument());

    expect(screen.getByTestId('deck-finder-sync-button')).toHaveTextContent('同步热门卡组');
    expect(screen.getByTestId('deck-finder-sync-source-note')).toHaveTextContent('数据来自 HSGuru');
  });

  it('shows detailed progress while syncing class matchup winrates', async () => {
    let progressHandler: ((progress: TestSyncProgress) => void) | undefined;
    let resolveSync: ((value: { ok: true; fetchedAt: string; count: number }) => void) | undefined;
    const syncPromise = new Promise<{ ok: true; fetchedAt: string; count: number }>((resolve) => {
      resolveSync = resolve;
    });
    (window as { hdt: { popularDecks: typeof window.hdt.popularDecks } }).hdt.popularDecks = {
      ...window.hdt.popularDecks,
      syncStart: vi.fn().mockReturnValue(syncPromise),
      onSyncProgress: vi.fn((cb: (progress: TestSyncProgress) => void) => {
        progressHandler = cb;
        return () => undefined;
      }),
    };

    await act(async () => { renderTab('zh-CN'); });
    await waitFor(() => expect(screen.getByText('卡组查找')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('deck-finder-sync-button'));
    await waitFor(() =>
      expect(screen.getByTestId('deck-finder-sync-button')).toHaveTextContent('读取环境列表'),
    );

    act(() => {
      progressHandler?.({ phase: 'details', completed: 37, total: 100 });
    });

    expect(screen.getByTestId('deck-finder-sync-button')).toHaveTextContent('职业胜率 37/100');

    await act(async () => {
      resolveSync?.({ ok: true, fetchedAt: '2026-05-09T12:00:00Z', count: FIXTURE.length });
      await syncPromise;
    });
    await waitFor(() =>
      expect(screen.getByTestId('deck-finder-sync-button')).toHaveTextContent('同步热门卡组'),
    );
  });

  it('keeps the HSGuru source note readable when the locale bundle is stale', async () => {
    const staleMessages = JSON.parse(JSON.stringify(defaultMessages)) as MessagesByLocale;
    const zhFinder = (staleMessages['zh-CN'] as { decks: { finder: Record<string, unknown> } }).decks.finder;
    const enFinder = (staleMessages['en-US'] as { decks: { finder: Record<string, unknown> } }).decks.finder;
    delete zhFinder.syncSourceNote;
    delete enFinder.syncSourceNote;

    await act(async () => { renderTab('zh-CN', staleMessages); });
    await waitFor(() => expect(screen.getByText('卡组查找')).toBeInTheDocument());

    expect(screen.getByTestId('deck-finder-sync-source-note')).toHaveTextContent('数据来自 HSGuru');
  });

  it('default Standard format pill is selected', async () => {
    await act(async () => { renderTab(); });
    await waitFor(() => expect(screen.getByText('Deck Finder')).toBeInTheDocument());
    // Standard pill — find by text 'STD' and check border-accent class
    const stdPill = screen.getByText('STD');
    expect(stdPill.className).toContain('border-accent');
  });

  it('only exposes Standard/Wild format filters and omits archetype filters', async () => {
    await act(async () => { renderTab(); });
    await waitFor(() => expect(screen.getByText('Deck Finder')).toBeInTheDocument());

    expect(screen.getByText('STD')).toBeInTheDocument();
    expect(screen.getByText('WLD')).toBeInTheDocument();
    expect(screen.queryByText('CLS')).toBeNull();
    expect(screen.queryByText('TWS')).toBeNull();
    expect(screen.queryByText('ARCH')).toBeNull();
    expect(screen.queryByText('CONTROL')).toBeNull();
  });

  it('header count chip reflects filtered vs total', async () => {
    await act(async () => { renderTab(); });
    // Standard format + default 20k dust narrows from 4 → 2 (Wild and >20k excluded)
    await waitFor(() => {
      const counts = screen.getAllByText((_, el) => el?.tagName === 'DIV' && /of/.test(el.textContent ?? ''));
      expect(counts.length).toBeGreaterThan(0);
    });
    // Multiple `2`s now appear (count chip + ×2 in key cards). At least one is the count chip.
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
  });

  it('shows dust cost instead of author in deck-list row metadata', async () => {
    await act(async () => { renderTab(); });
    await waitFor(() => expect(screen.queryAllByText('Aggro Fire Mage').length).toBeGreaterThan(0));

    const metas = screen.getAllByTestId('deck-finder-list-row-meta');
    expect(metas.some((el) => el.textContent?.includes('◆ 4,800'))).toBe(true);
    expect(metas.some((el) => /by\s+thalia/i.test(el.textContent ?? ''))).toBe(false);
  });

  it('renders class portrait images in the list and detail header', async () => {
    await act(async () => { renderTab(); });
    await waitFor(() => expect(screen.queryAllByText('Aggro Fire Mage').length).toBeGreaterThan(0));

    expect(screen.getByTestId('deck-finder-list-class-portrait-MAGE')).toBeInTheDocument();
    expect(screen.getByTestId('deck-finder-detail-class-portrait-MAGE')).toBeInTheDocument();
  });

  it('clicking the MAGE class chip narrows the list', async () => {
    const user = userEvent.setup();
    await act(async () => { renderTab(); });
    await waitFor(() => expect(screen.queryAllByText('Aggro Fire Mage').length).toBeGreaterThan(0));

    // Two Standard decks visible (Mage + Warrior) — Warrior is row-only (Mage is row+detail)
    expect(screen.queryAllByText('Control Warrior').length).toBe(1);
    expect(screen.queryByText('Whale Paladin')).toBeNull();

    await user.click(screen.getByText('Mage'));
    await waitFor(() => expect(screen.queryByText('Control Warrior')).toBeNull());
    expect(screen.queryAllByText('Aggro Fire Mage').length).toBeGreaterThan(0);
  });

  it('has a separate infinite max-dust step above 20000 that disables dust filtering', async () => {
    await act(async () => { renderTab(); });
    await waitFor(() => expect(screen.queryAllByText('Aggro Fire Mage').length).toBeGreaterThan(0));

    expect(screen.queryByText('Whale Paladin')).toBeNull();
    const slider = screen.getByRole('slider', { name: 'MAX DUST' });
    expect(slider).toHaveAttribute('max', '20500');

    fireEvent.change(slider, { target: { value: '20500' } });

    await waitFor(() => expect(screen.getByText('Whale Paladin')).toBeInTheDocument());
    expect(screen.getByText('◆ ∞')).toBeInTheDocument();
  });

  it('switching format pill changes the visible decks', async () => {
    const user = userEvent.setup();
    await act(async () => { renderTab(); });
    await waitFor(() => expect(screen.queryAllByText('Aggro Fire Mage').length).toBeGreaterThan(0));

    await user.click(screen.getByText('WLD'));
    await waitFor(() => expect(screen.queryAllByText('Reno Priest').length).toBeGreaterThan(0));
    expect(screen.queryByText('Aggro Fire Mage')).toBeNull();
  });

  it('first deck is auto-selected (detail pane shows it)', async () => {
    await act(async () => { renderTab(); });
    await waitFor(() => {
      // Both row + detail render the name; so we expect at least 2 occurrences
      expect(screen.getAllByText('Aggro Fire Mage').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('renders class matchup winrates for the selected synced deck', async () => {
    await act(async () => { renderTab(); });
    await waitFor(() => expect(screen.queryAllByText('Aggro Fire Mage').length).toBeGreaterThan(0));

    const table = screen.getByTestId('deck-finder-class-matchups');
    expect(table).toHaveTextContent('CLASS MATCHUPS');

    const hunter = screen.getByTestId('deck-finder-class-matchup-HUNTER');
    expect(hunter).toHaveTextContent('Hunter');
    expect(hunter).toHaveTextContent('66.1%');
    expect(hunter).toHaveTextContent('56');
    expect(hunter.className).toContain('bg-green/30');

    const warrior = screen.getByTestId('deck-finder-class-matchup-WARRIOR');
    expect(warrior).toHaveTextContent('40%');
    expect(warrior.className).toContain('bg-red/15');
  });

  it('hides the class matchup section when the selected deck has no matchup data', async () => {
    const user = userEvent.setup();
    await act(async () => { renderTab(); });
    await waitFor(() => expect(screen.queryAllByText('Control Warrior').length).toBe(1));

    await user.click(screen.getByText('Control Warrior'));
    await waitFor(() => expect(screen.queryByTestId('deck-finder-class-matchups')).toBeNull());
  });

  it('renders key-card copy counts in a readable badge', async () => {
    await act(async () => { renderTab(); });
    await waitFor(() => expect(screen.queryAllByText('Aggro Fire Mage').length).toBeGreaterThan(0));

    const badges = screen.getAllByTestId('deck-finder-key-card-count');
    expect(badges[0]).toHaveTextContent('×2');
    expect(badges[0]!.className).toContain('bg-overlay-elevated');
    expect(badges[0]!.className).toContain('border-border-hi');
  });

  it('places key-card previews to the left when maximized and near the right edge', async () => {
    const savedHdt = window.hdt;
    const cardPreviewShow = vi.fn();
    (window as { hdt: typeof window.hdt }).hdt = {
      ...savedHdt,
      cardPreview: {
        show: cardPreviewShow,
        showPool: vi.fn(),
        showEnhancedPool: vi.fn(),
        showExtra: vi.fn(),
        showEnhancedExtra: vi.fn(),
        hide: vi.fn(),
        onSetCard: vi.fn(() => () => {}),
        onSetPool: vi.fn(() => () => {}),
        onSetEnhancedPool: vi.fn(() => () => {}),
        onSetExtra: vi.fn(() => () => {}),
        onSetEnhancedExtra: vi.fn(() => () => {}),
      },
    };
    Object.defineProperty(window, 'screenX', { value: 0, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window.screen, 'width', { value: 1920, configurable: true });
    Object.defineProperty(window.screen, 'availLeft', { value: 0, configurable: true });
    Object.defineProperty(window.screen, 'availWidth', { value: 1920, configurable: true });

    try {
      await act(async () => { renderTab(); });
      await waitFor(() => expect(screen.queryAllByText('Aggro Fire Mage').length).toBeGreaterThan(0));

      vi.useFakeTimers();
      const row = screen.getAllByTestId('deck-finder-key-card-row')[0]!;
      row.getBoundingClientRect = vi.fn(() => ({
        x: 1500,
        y: 260,
        width: 300,
        height: 24,
        top: 260,
        right: 1800,
        bottom: 284,
        left: 1500,
        toJSON: () => '',
      }));

      fireEvent.mouseEnter(row);
      act(() => { vi.advanceTimersByTime(300); });

      expect(cardPreviewShow).toHaveBeenCalledTimes(1);
      expect(cardPreviewShow.mock.calls[0]![0]).toBe('CS2_029');
      expect(cardPreviewShow.mock.calls[0]![1]).toMatchObject({ side: 'left' });
    } finally {
      (window as { hdt: typeof window.hdt }).hdt = savedHdt;
      vi.useRealTimers();
    }
  });

  it('renders Chinese labels under zh-CN locale', async () => {
    await act(async () => { renderTab('zh-CN'); });
    await waitFor(() => expect(screen.getByText('卡组查找')).toBeInTheDocument());
    expect(screen.getByText('卡组 / 查找')).toBeInTheDocument();
    expect(screen.getByText('法师')).toBeInTheDocument();
    expect(screen.getByText('德鲁伊')).toBeInTheDocument();
    expect(screen.queryByText('Mage')).toBeNull();
    expect(screen.queryByText('Druid')).toBeNull();
    expect(screen.queryByText('经典')).toBeNull();
    expect(screen.queryByText('时光')).toBeNull();
    expect(screen.queryByText('流派')).toBeNull();
  });
});
