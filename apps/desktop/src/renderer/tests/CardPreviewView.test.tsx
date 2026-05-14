import { act, render, screen, waitFor } from '@testing-library/react';
import type { CardDef } from '@hdt/hearthdb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardPreviewView } from '../src/components/CardPreviewView';
import { I18nProvider } from '../src/i18n';

describe('CardPreviewView', () => {
  beforeEach(() => {
    window.hdt.cards.findById = vi.fn(async (cardId: string) => ({
      id: cardId,
      dbfId: 1,
      name: `Name ${cardId}`,
      cost: 3,
      cardClass: 'HUNTER',
      type: 'MINION',
      set: 'TEST',
      collectible: false,
    } satisfies CardDef));
    window.hdt.cardImages.get = vi.fn(async () => null);
  });

  it('exposes card names on compact pool previews before images load', async () => {
    let setPool: ((cardIds: readonly string[]) => void) | null = null;
    window.hdt.cardPreview = {
      show: vi.fn(),
      showPool: vi.fn(),
      showExtra: vi.fn(),
      hide: vi.fn(),
      onSetCard: vi.fn(() => () => undefined),
      onSetPool: vi.fn((cb: (cardIds: readonly string[]) => void) => {
        setPool = cb;
        return () => undefined;
      }),
      onSetExtra: vi.fn(() => () => undefined),
    };

    render(
      <I18nProvider preference="zh-CN">
        <CardPreviewView />
      </I18nProvider>,
    );

    act(() => {
      setPool?.(['BEAST_1', 'BEAST_2', 'BEAST_3']);
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Name BEAST_1')).toBeInTheDocument();
      expect(screen.getByLabelText('Name BEAST_2')).toBeInTheDocument();
      expect(screen.getByLabelText('Name BEAST_3')).toBeInTheDocument();
    });
  });

  it('lays out large card pools with at most four columns', async () => {
    let setPool: ((cardIds: readonly string[]) => void) | null = null;
    window.hdt.cardPreview = {
      show: vi.fn(),
      showPool: vi.fn(),
      showExtra: vi.fn(),
      hide: vi.fn(),
      onSetCard: vi.fn(() => () => undefined),
      onSetPool: vi.fn((cb: (cardIds: readonly string[]) => void) => {
        setPool = cb;
        return () => undefined;
      }),
      onSetExtra: vi.fn(() => () => undefined),
    };

    render(
      <I18nProvider preference="zh-CN">
        <CardPreviewView />
      </I18nProvider>,
    );

    act(() => {
      setPool?.(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Name G')).toBeInTheDocument();
    });

    expect(screen.getByTestId('card-preview-pool')).toHaveStyle({
      gridTemplateColumns: 'repeat(4, 230px)',
      gridAutoRows: '330px',
      gap: '14px',
    });
  });

  it('shows text-only enhanced preview payloads', async () => {
    let setExtra: ((payload: { title: string; lines: readonly string[] }) => void) | null = null;
    window.hdt.cardPreview = {
      show: vi.fn(),
      showPool: vi.fn(),
      showExtra: vi.fn(),
      hide: vi.fn(),
      onSetCard: vi.fn(() => () => undefined),
      onSetPool: vi.fn(() => () => undefined),
      onSetExtra: vi.fn((cb: (payload: { title: string; lines: readonly string[] }) => void) => {
        setExtra = cb;
        return () => undefined;
      }),
    };

    render(
      <I18nProvider preference="zh-CN">
        <CardPreviewView />
      </I18nProvider>,
    );

    act(() => {
      setExtra?.({
        title: 'Soul Feast',
        lines: ['本回合友方随从死亡：2；预计抽牌：2'],
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Soul Feast')).toBeInTheDocument();
      expect(screen.getByText('本回合友方随从死亡：2；预计抽牌：2')).toBeInTheDocument();
    });
  });
});
