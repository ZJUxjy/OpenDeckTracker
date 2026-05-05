import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { CardImagePopover } from '../src/components/CardImagePopover';
import { I18nProvider } from '../src/i18n';

function getMockRect(): DOMRect {
  return {
    x: 100,
    y: 200,
    width: 280,
    height: 30,
    top: 200,
    right: 380,
    bottom: 230,
    left: 100,
    toJSON: () => '',
  };
}

function renderZhCN(element: ReactElement) {
  return render(<I18nProvider preference="zh-CN">{element}</I18nProvider>);
}

describe('CardImagePopover', () => {
  beforeEach(() => {
    // Reset window.innerWidth/innerHeight for consistent positioning
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    window.hdt.cardImages.get = vi.fn().mockResolvedValue(null);
  });

  it('renders an empty src and shows the loading state until the cache resolves', () => {
    // CSP blocks direct CDN fetches — the popover never falls back to a
    // CDN URL. Until window.hdt.cardImages.get resolves with a cached URL
    // (mock returns null in beforeEach), the <img src> is empty and the
    // loading text is visible.
    renderZhCN(
      <CardImagePopover cardId="EX1_277" anchorRect={getMockRect()} onClose={vi.fn()} />,
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '');
    expect(screen.getByText('正在加载卡牌图片...')).toBeInTheDocument();
  });

  it('calls onClose on mouse leave', () => {
    const onClose = vi.fn();
    renderZhCN(
      <CardImagePopover cardId="EX1_277" anchorRect={getMockRect()} onClose={onClose} />,
    );
    const container = screen.getByRole('img').closest('.fixed')!;
    fireEvent.mouseLeave(container);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows loading state initially', () => {
    renderZhCN(
      <CardImagePopover cardId="EX1_277" anchorRect={getMockRect()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('正在加载卡牌图片...')).toBeInTheDocument();
  });

  it('uses cached image source when preload API resolves', async () => {
    window.hdt.cardImages.get = vi.fn().mockResolvedValue({
      url: 'hdt-card-image://cache/zhCN/256x/EX1_277.png',
      locale: 'zhCN',
      size: '256x',
    });

    renderZhCN(
      <CardImagePopover cardId="EX1_277" anchorRect={getMockRect()} onClose={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('img')).toHaveAttribute(
        'src',
        'hdt-card-image://cache/zhCN/256x/EX1_277.png',
      );
    });
  });
});
