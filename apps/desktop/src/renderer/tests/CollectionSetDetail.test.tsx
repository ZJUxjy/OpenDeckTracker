import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CardDef } from '@hdt/hearthdb';
import type { SetProgress } from '@hdt/core';

import { CollectionSetDetail } from '../src/components/CollectionSetDetail';
import { I18nProvider } from '../src/i18n';

function row(overrides: Partial<SetProgress> & { setCode: string }): SetProgress {
  return {
    setCode: overrides.setCode,
    format: overrides.format ?? 'standard',
    totalCards: overrides.totalCards ?? 72,
    totalCopies: overrides.totalCopies ?? 144,
    ownedCopies: overrides.ownedCopies ?? 0,
    ownedUniqueCards: overrides.ownedUniqueCards ?? 0,
  };
}

function makeCard(overrides: Partial<CardDef> & { id: string }): CardDef {
  const base: CardDef = {
    id: overrides.id,
    dbfId: overrides.dbfId ?? (Number(overrides.id.replace(/\D/g, '')) || 1),
    name: overrides.name ?? overrides.id,
    cardClass: overrides.cardClass ?? 'NEUTRAL',
    set: overrides.set ?? 'SET_X',
    type: overrides.type ?? 'MINION',
    collectible: overrides.collectible ?? true,
  };
  if (overrides.rarity !== undefined) base.rarity = overrides.rarity;
  if (overrides.cost !== undefined) base.cost = overrides.cost;
  if (overrides.attack !== undefined) base.attack = overrides.attack;
  if (overrides.health !== undefined) base.health = overrides.health;
  return base;
}

function setHdtMocks(opts: { cards?: CardDef[]; searchSpy?: ReturnType<typeof vi.fn> } = {}) {
  const search = opts.searchSpy ?? vi.fn(async () => opts.cards ?? []);
  (window as unknown as { hdt: typeof window.hdt }).hdt = {
    ...(window.hdt ?? ({} as typeof window.hdt)),
    cards: {
      ...(window.hdt?.cards ?? {}),
      search,
    } as unknown as typeof window.hdt.cards,
    cardImages: {
      ...(window.hdt?.cardImages ?? {}),
      get: vi.fn(async (cardId: string) => ({ url: `cache://${cardId}.png`, locale: 'en-US', size: 'full' })),
      getTile: vi.fn(async () => null),
    } as unknown as typeof window.hdt.cardImages,
  };
  return search;
}

function renderDetail(props: Partial<React.ComponentProps<typeof CollectionSetDetail>> = {}) {
  const defaults: React.ComponentProps<typeof CollectionSetDetail> = {
    setCode: 'SET_1897',
    row: row({ setCode: 'SET_1897' }),
    ownedByDbfId: new Map(),
    onBack: () => undefined,
  };
  return render(
    <I18nProvider preference="en-US">
      <CollectionSetDetail {...defaults} {...props} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  setHdtMocks();
});

afterEach(() => {
  // Clear DOM between tests, restore mocks
  vi.restoreAllMocks();
});

describe('CollectionSetDetail — header', () => {
  it('renders set name and English subtitle in en-US', () => {
    renderDetail({ setCode: 'SET_1897', row: row({ setCode: 'SET_1897', totalCards: 263 }) });
    expect(screen.getByText("Whizbang's Workshop")).toBeInTheDocument();
    expect(screen.getByTestId('detail-subtitle').textContent).toContain('263 cards');
  });

  it('renders MINI-SET badge when the set label contains Mini-Set', () => {
    // 'TITANS' label is plain in en-US, so we fake a known mini set entry.
    // The mini detection runs on the label; use a code whose en-US label contains "Mini-Set".
    renderDetail({ setCode: 'SET_1898', row: row({ setCode: 'SET_1898', totalCards: 35 }) });
    expect(screen.getByTestId('detail-mini-badge')).toBeInTheDocument();
  });

  it('renders the complete pill only when ownedCopies === totalCopies', () => {
    const { rerender } = renderDetail({
      setCode: 'SET_1897',
      row: row({ setCode: 'SET_1897', ownedCopies: 144, totalCopies: 144, ownedUniqueCards: 72, totalCards: 72 }),
    });
    expect(screen.getByTestId('detail-complete-pill')).toBeInTheDocument();

    rerender(
      <I18nProvider preference="en-US">
        <CollectionSetDetail
          setCode="SET_1897"
          row={row({ setCode: 'SET_1897', ownedCopies: 50, totalCopies: 144 })}
          ownedByDbfId={new Map()}
          onBack={() => undefined}
        />
      </I18nProvider>,
    );
    expect(screen.queryByTestId('detail-complete-pill')).not.toBeInTheDocument();
  });

  it('back button click invokes onBack', () => {
    const onBack = vi.fn();
    renderDetail({ onBack });
    fireEvent.click(screen.getByTestId('detail-back'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renders ownedUniqueCards / totalCards stat in the header', () => {
    renderDetail({
      setCode: 'SET_1897',
      row: row({ setCode: 'SET_1897', ownedUniqueCards: 50, totalCards: 263 }),
    });
    expect(screen.getByTestId('detail-unique-value').textContent).toBe('50');
    expect(screen.getByTestId('detail-unique-total').textContent).toContain('263');
  });
});

describe('CollectionSetDetail — filters + grid', () => {
  it('cards.search is called once with { set, collectible, limit } on mount', async () => {
    const search = setHdtMocks({ cards: [] });
    await act(async () => {
      renderDetail({ setCode: 'SET_1897' });
    });
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(search.mock.calls[0]?.[0]).toEqual({ set: 'SET_1897', collectible: true, limit: 10000 });
  });

  it('renders 4 filter controls plus mana pill group', async () => {
    setHdtMocks({ cards: [] });
    await act(async () => {
      renderDetail();
    });
    expect(screen.getByTestId('detail-filter-rarity')).toBeInTheDocument();
    expect(screen.getByTestId('detail-filter-class')).toBeInTheDocument();
    expect(screen.getByTestId('detail-filter-type')).toBeInTheDocument();
    expect(screen.getByTestId('detail-filter-search')).toBeInTheDocument();
    expect(screen.getByTestId('detail-mana-pill-all')).toBeInTheDocument();
    for (const c of [1, 2, 3, 4, 5, 6]) {
      expect(screen.getByTestId(`detail-mana-pill-${c}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('detail-mana-pill-7plus')).toBeInTheDocument();
  });

  it('mana pill 2 filters cells to cost === 2', async () => {
    setHdtMocks({
      cards: [
        makeCard({ id: 'C1', name: 'One', cost: 1, rarity: 'COMMON' }),
        makeCard({ id: 'C2', name: 'Two', cost: 2, rarity: 'COMMON' }),
        makeCard({ id: 'C2b', name: 'TwoB', cost: 2, rarity: 'RARE' }),
        makeCard({ id: 'C3', name: 'Three', cost: 3, rarity: 'COMMON' }),
      ],
    });
    await act(async () => {
      renderDetail();
    });
    await waitFor(() => expect(screen.getByAltText('One')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('detail-mana-pill-2'));
    expect(screen.queryByAltText('One')).not.toBeInTheDocument();
    expect(screen.getByAltText('Two')).toBeInTheDocument();
    expect(screen.getByAltText('TwoB')).toBeInTheDocument();
    expect(screen.queryByAltText('Three')).not.toBeInTheDocument();
  });

  it('mana pill 7+ filters cells to cost >= 7', async () => {
    setHdtMocks({
      cards: [
        makeCard({ id: 'C6', name: 'Six', cost: 6, rarity: 'COMMON' }),
        makeCard({ id: 'C7', name: 'Seven', cost: 7, rarity: 'COMMON' }),
        makeCard({ id: 'C10', name: 'Ten', cost: 10, rarity: 'EPIC' }),
      ],
    });
    await act(async () => {
      renderDetail();
    });
    await waitFor(() => expect(screen.getByAltText('Six')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('detail-mana-pill-7plus'));
    expect(screen.queryByAltText('Six')).not.toBeInTheDocument();
    expect(screen.getByAltText('Seven')).toBeInTheDocument();
    expect(screen.getByAltText('Ten')).toBeInTheDocument();
  });

  it('rarity dropdown filters cells by rarity', async () => {
    setHdtMocks({
      cards: [
        makeCard({ id: 'A', name: 'Alpha', rarity: 'COMMON' }),
        makeCard({ id: 'B', name: 'Beta', rarity: 'LEGENDARY' }),
      ],
    });
    await act(async () => {
      renderDetail();
    });
    await waitFor(() => expect(screen.getByAltText('Alpha')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('detail-filter-rarity'), { target: { value: 'LEGENDARY' } });
    expect(screen.queryByAltText('Alpha')).not.toBeInTheDocument();
    expect(screen.getByAltText('Beta')).toBeInTheDocument();
  });

  it('search filters cells by card name substring (case-insensitive)', async () => {
    setHdtMocks({
      cards: [
        makeCard({ id: 'P1', name: 'Fireball' }),
        makeCard({ id: 'P2', name: 'Water Bolt' }),
      ],
    });
    await act(async () => {
      renderDetail();
    });
    await waitFor(() => expect(screen.getByAltText('Fireball')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('detail-filter-search'), { target: { value: 'fire' } });
    expect(screen.getByAltText('Fireball')).toBeInTheDocument();
    expect(screen.queryByAltText('Water Bolt')).not.toBeInTheDocument();
  });

  it('filters reset when setCode prop changes', async () => {
    setHdtMocks({
      cards: [makeCard({ id: 'Z', name: 'Solo', rarity: 'EPIC' })],
    });
    let api: ReturnType<typeof render>;
    await act(async () => {
      api = render(
        <I18nProvider preference="en-US">
          <CollectionSetDetail
            setCode="SET_A"
            row={row({ setCode: 'SET_A' })}
            ownedByDbfId={new Map()}
            onBack={() => undefined}
          />
        </I18nProvider>,
      );
    });
    await waitFor(() => expect(screen.getByAltText('Solo')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('detail-mana-pill-5'));
    fireEvent.change(screen.getByTestId('detail-filter-rarity'), { target: { value: 'LEGENDARY' } });

    await act(async () => {
      api!.rerender(
        <I18nProvider preference="en-US">
          <CollectionSetDetail
            setCode="SET_B"
            row={row({ setCode: 'SET_B' })}
            ownedByDbfId={new Map()}
            onBack={() => undefined}
          />
        </I18nProvider>,
      );
    });
    await waitFor(() => {
      const rarity = screen.getByTestId('detail-filter-rarity') as HTMLSelectElement;
      expect(rarity.value).toBe('ALL');
    });
    const allPill = screen.getByTestId('detail-mana-pill-all');
    expect(allPill.getAttribute('aria-pressed')).toBe('true');
  });

  it('unowned card cells render a red owned badge', async () => {
    setHdtMocks({
      cards: [makeCard({ id: 'U1', dbfId: 100, name: 'Locked', rarity: 'COMMON' })],
    });
    await act(async () => {
      renderDetail({ ownedByDbfId: new Map([[100, 0]]) });
    });
    await waitFor(() => expect(screen.getByAltText('Locked')).toBeInTheDocument());
    expect(screen.getByTestId('cell-owned-badge').className).toContain('red');
  });
});
