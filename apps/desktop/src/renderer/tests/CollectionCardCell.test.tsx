import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { CardDef } from '@hdt/hearthdb';

import { CollectionCardCell } from '../src/components/CollectionCardCell';
import { I18nProvider } from '../src/i18n';

function card(overrides: Partial<CardDef> & { id: string }): CardDef {
  const base: CardDef = {
    id: overrides.id,
    dbfId: overrides.dbfId ?? 1,
    name: overrides.name ?? 'Test',
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

function setCardImagesMock(impl?: (cardId: string) => Promise<{ url: string } | null>) {
  (window as unknown as { hdt: typeof window.hdt }).hdt = {
    ...(window.hdt ?? ({} as typeof window.hdt)),
    cardImages: {
      ...(window.hdt?.cardImages ?? {}),
      get: vi.fn(impl ?? (async (cardId) => ({ url: `cache://${cardId}.png`, locale: 'en-US', size: 'full' }))),
      getTile: vi.fn(async () => null),
    } as unknown as typeof window.hdt.cardImages,
  };
}

function renderCell(props: React.ComponentProps<typeof CollectionCardCell>) {
  return render(
    <I18nProvider preference="en-US">
      <CollectionCardCell {...props} />
    </I18nProvider>,
  );
}

describe('CollectionCardCell', () => {
  beforeEach(() => {
    setCardImagesMock();
  });

  it('fully owned card renders green badge with no dim overlay', () => {
    renderCell({ card: card({ id: 'A', rarity: 'RARE' }), ownedCount: 2 });
    const badge = screen.getByTestId('cell-owned-badge');
    expect(badge.className).toContain('green');
    expect(badge.textContent).toContain('x2/2');
    expect(screen.queryByTestId('cell-dim-overlay')).not.toBeInTheDocument();
  });

  it('partial ownership renders amber badge', () => {
    renderCell({ card: card({ id: 'B', rarity: 'EPIC' }), ownedCount: 1 });
    const badge = screen.getByTestId('cell-owned-badge');
    expect(badge.className).toContain('amber');
    expect(badge.textContent).toContain('x1/2');
  });

  it('unowned card renders dim overlay and 未拥有 pill', () => {
    renderCell({ card: card({ id: 'C', rarity: 'LEGENDARY' }), ownedCount: 0 });
    expect(screen.getByTestId('cell-dim-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('cell-unowned-pill')).toBeInTheDocument();
    expect(screen.getByTestId('cell-owned-badge').className).toContain('red');
  });

  it('dust chip reads value from dustValueForRarity', () => {
    renderCell({ card: card({ id: 'D', rarity: 'EPIC' }), ownedCount: 0 });
    expect(screen.getByTestId('cell-dust-value').textContent).toBe('400');
  });

  it('card image src resolves from cardImages.get', async () => {
    renderCell({ card: card({ id: 'E', rarity: 'COMMON' }), ownedCount: 1 });
    await waitFor(() => {
      const img = screen.getByTestId('cell-image') as HTMLImageElement;
      expect(img.src).toContain('cache://E.png');
    });
  });

  it('legendary cards cap max at 1', () => {
    renderCell({ card: card({ id: 'F', rarity: 'LEGENDARY' }), ownedCount: 1 });
    expect(screen.getByTestId('cell-owned-badge').textContent).toContain('x1/1');
    expect(screen.getByTestId('cell-owned-badge').className).toContain('green');
  });
});
