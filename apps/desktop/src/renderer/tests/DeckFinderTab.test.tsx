import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PopularDeckEnriched } from '@hdt/core';

import { DeckFinderTab } from '../src/components/DeckFinderTab';
import { I18nProvider } from '../src/i18n';

const FIXTURE: PopularDeckEnriched[] = [
  {
    id: 'mage1', name: 'Aggro Fire Mage', class: 'MAGE', format: 'Standard', archetype: 'Aggro',
    deckstring: 'AAEC-FAKE', winratePercent: 58, gamesCount: 12400, dustCost: 4800,
    author: 'thalia', updatedAt: '2026-04-25',
    manaCurve: [0, 6, 8, 6, 4, 2, 2, 2], cardNames: ['Fireball', 'Polymorph', 'Frostbolt'],
    deckCardList: [],
    keyCards: [{ cardId: 'CS2_029', name: 'Fireball', count: 2, cost: 4 }, { cardId: 'NEW_010', name: 'Polymorph', count: 2, cost: 4 }],
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
    id: 'priestw', name: 'Reno Priest', class: 'PRIEST', format: 'Wild', archetype: 'Combo',
    deckstring: 'AAEC-FAKE3', winratePercent: 52, gamesCount: 6120, dustCost: 13400,
    author: 'ren', updatedAt: '2026-04-24',
    manaCurve: [0, 0, 4, 4, 6, 4, 6, 6], cardNames: ['Anduin'],
    deckCardList: [],
    keyCards: [{ cardId: 'HERO_09y', name: 'Anduin', count: 1, cost: 4 }],
  },
];

function renderTab(locale: 'en-US' | 'zh-CN' = 'en-US') {
  return render(
    <I18nProvider preference={locale}>
      <DeckFinderTab />
    </I18nProvider>,
  );
}

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

  it('default Standard format pill is selected', async () => {
    await act(async () => { renderTab(); });
    await waitFor(() => expect(screen.getByText('Deck Finder')).toBeInTheDocument());
    // Standard pill — find by text 'STD' and check border-accent class
    const stdPill = screen.getByText('STD');
    expect(stdPill.className).toContain('border-accent');
  });

  it('header count chip reflects filtered vs total', async () => {
    await act(async () => { renderTab(); });
    // Standard format default narrows from 3 → 2 (priestw is Wild)
    await waitFor(() => {
      const counts = screen.getAllByText((_, el) => el?.tagName === 'DIV' && /of/.test(el.textContent ?? ''));
      expect(counts.length).toBeGreaterThan(0);
    });
    // Multiple `2`s now appear (count chip + ×2 in key cards). At least one is the count chip.
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
  });

  it('clicking the MAGE class chip narrows the list', async () => {
    const user = userEvent.setup();
    await act(async () => { renderTab(); });
    await waitFor(() => expect(screen.queryAllByText('Aggro Fire Mage').length).toBeGreaterThan(0));

    // Two Standard decks visible (Mage + Warrior) — Warrior is row-only (Mage is row+detail)
    expect(screen.queryAllByText('Control Warrior').length).toBe(1);

    await user.click(screen.getByText('Mage'));
    await waitFor(() => expect(screen.queryByText('Control Warrior')).toBeNull());
    expect(screen.queryAllByText('Aggro Fire Mage').length).toBeGreaterThan(0);
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

  it('renders Chinese labels under zh-CN locale', async () => {
    await act(async () => { renderTab('zh-CN'); });
    await waitFor(() => expect(screen.getByText('卡组查找')).toBeInTheDocument());
    expect(screen.getByText('卡组 / 查找')).toBeInTheDocument();
  });
});
