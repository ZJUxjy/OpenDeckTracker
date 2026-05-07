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

  it('shows card names under Animal Companion pool images before images load', async () => {
    let setPool: ((cardIds: readonly string[]) => void) | null = null;
    window.hdt.cardPreview = {
      show: vi.fn(),
      showPool: vi.fn(),
      hide: vi.fn(),
      onSetCard: vi.fn(() => () => undefined),
      onSetPool: vi.fn((cb: (cardIds: readonly string[]) => void) => {
        setPool = cb;
        return () => undefined;
      }),
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
      expect(screen.getByText('Name BEAST_1')).toBeInTheDocument();
      expect(screen.getByText('Name BEAST_2')).toBeInTheDocument();
      expect(screen.getByText('Name BEAST_3')).toBeInTheDocument();
    });
  });
});
