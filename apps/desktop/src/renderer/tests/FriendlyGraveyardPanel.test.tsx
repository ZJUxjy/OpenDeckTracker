import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpponentCardRecord } from '@hdt/core';
import type { CardDef } from '@hdt/hearthdb';
import { FriendlyGraveyardPanel } from '../src/components/FriendlyGraveyardPanel';
import { I18nProvider } from '../src/i18n';

const CARD_DEFS: Record<string, CardDef> = {
  DEATH_MINION: {
    id: 'DEATH_MINION',
    dbfId: 1,
    name: '蛛魔之卵',
    cost: 2,
    cardClass: 'NEUTRAL',
    rarity: 'RARE',
    set: 'TEST',
    type: 'MINION',
    text: '<b>亡语：</b>召唤一个4/4的蛛魔。',
    collectible: true,
  },
  LEGENDARY_MINION: {
    id: 'LEGENDARY_MINION',
    dbfId: 2,
    name: '提里奥弗丁',
    cost: 8,
    cardClass: 'PALADIN',
    rarity: 'LEGENDARY',
    set: 'TEST',
    type: 'MINION',
    text: '圣盾，嘲讽。',
    collectible: true,
  },
  LEGENDARY_TEXT_SPELL: {
    id: 'LEGENDARY_TEXT_SPELL',
    dbfId: 3,
    name: '邀请函',
    cost: 3,
    cardClass: 'PALADIN',
    rarity: 'RARE',
    set: 'TEST',
    type: 'SPELL',
    text: '发现一张传说随从牌。',
    collectible: true,
  },
  TEST_WEAPON: {
    id: 'TEST_WEAPON',
    dbfId: 4,
    name: '真银圣剑',
    cost: 4,
    cardClass: 'PALADIN',
    rarity: 'COMMON',
    set: 'TEST',
    type: 'WEAPON',
    text: '在你的英雄攻击后，为其恢复2点生命值。',
    collectible: true,
  },
};

function record(entityId: number, cardId: string): OpponentCardRecord {
  return {
    entityId,
    cardId,
    zone: 'GRAVEYARD',
    order: entityId,
    created: false,
  };
}

function graveyardRecords(): OpponentCardRecord[] {
  return [
    record(1, 'DEATH_MINION'),
    record(2, 'LEGENDARY_MINION'),
    record(3, 'LEGENDARY_TEXT_SPELL'),
    record(4, 'TEST_WEAPON'),
  ];
}

function rowIds(): string[] {
  return screen
    .queryAllByTestId('friendly-graveyard-row')
    .map((row) => row.getAttribute('data-card-id') ?? '');
}

describe('FriendlyGraveyardPanel filters', () => {
  beforeEach(() => {
    window.hdt = {
      ...window.hdt,
      cards: {
        ...window.hdt.cards,
        findById: vi.fn(async (cardId: string) => CARD_DEFS[cardId] ?? null),
      },
      cardImages: {
        ...window.hdt.cardImages,
        getTile: vi.fn().mockResolvedValue(null),
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('filters by card name/text and treats 传说 as legendary minions', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider preference="zh-CN">
        <FriendlyGraveyardPanel records={graveyardRecords()} />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getByText('蛛魔之卵')).toBeInTheDocument());

    const search = screen.getByTestId('friendly-graveyard-search');
    await user.type(search, '亡语');
    expect(rowIds()).toEqual(['DEATH_MINION']);

    await user.clear(search);
    await user.type(search, '传说');
    expect(rowIds()).toEqual(['LEGENDARY_MINION', 'LEGENDARY_TEXT_SPELL']);
  });

  it('filters by minion, spell, and weapon card types', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider preference="zh-CN">
        <FriendlyGraveyardPanel records={graveyardRecords()} />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getByText('真银圣剑')).toBeInTheDocument());

    const typeFilter = screen.getByTestId('friendly-graveyard-type-filter');
    await user.selectOptions(typeFilter, 'SPELL');
    expect(rowIds()).toEqual(['LEGENDARY_TEXT_SPELL']);

    await user.selectOptions(typeFilter, 'WEAPON');
    expect(rowIds()).toEqual(['TEST_WEAPON']);

    await user.selectOptions(typeFilter, 'MINION');
    expect(rowIds()).toEqual(['DEATH_MINION', 'LEGENDARY_MINION']);
  });

  it('uses static derived-card pool preview for Nespirah rows', async () => {
    vi.useFakeTimers();
    const showPool = vi.fn();
    const showEnhancedPool = vi.fn();
    const show = vi.fn();
    const hide = vi.fn();
    window.hdt = {
      ...window.hdt,
      cardPreview: {
        ...window.hdt.cardPreview,
        show,
        showPool,
        showEnhancedPool,
        hide,
      },
    };

    render(
      <I18nProvider preference="zh-CN">
        <FriendlyGraveyardPanel records={[record(10, 'CATA_527')]} />
      </I18nProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      fireEvent.mouseEnter(screen.getByTestId('friendly-graveyard-row'));
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(show).not.toHaveBeenCalled();
    expect(showPool).not.toHaveBeenCalled();
    expect(showEnhancedPool).toHaveBeenCalledTimes(1);
    expect(showEnhancedPool.mock.calls[0]![0]).toBe('CATA_527');
    expect(showEnhancedPool.mock.calls[0]![1]).toEqual(['CATA_527t2']);
    vi.useRealTimers();
  });
});
