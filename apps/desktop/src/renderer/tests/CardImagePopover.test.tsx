import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CardImagePopover } from '../src/components/CardImagePopover';

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

describe('CardImagePopover', () => {
  beforeEach(() => {
    // Reset window.innerWidth/innerHeight for consistent positioning
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
  });

  it('renders with zhCN image URL', () => {
    render(
      <CardImagePopover cardId="EX1_277" anchorRect={getMockRect()} onClose={vi.fn()} />,
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', expect.stringContaining('/zhCN/'));
    expect(img).toHaveAttribute('src', expect.stringContaining('EX1_277'));
  });

  it('falls back to enUS on error', async () => {
    render(
      <CardImagePopover cardId="EX1_277" anchorRect={getMockRect()} onClose={vi.fn()} />,
    );
    const img = screen.getByRole('img');

    // Simulate first error (zhCN → enUS fallback)
    fireEvent.error(img);
    expect(img).toHaveAttribute('src', expect.stringContaining('/enUS/'));

    // Simulate second error (enUS → error state)
    fireEvent.error(img);
    await waitFor(() => {
      expect(screen.getByText('卡图加载失败')).toBeInTheDocument();
    });
  });

  it('calls onClose on mouse leave', () => {
    const onClose = vi.fn();
    render(
      <CardImagePopover cardId="EX1_277" anchorRect={getMockRect()} onClose={onClose} />,
    );
    const container = screen.getByRole('img').closest('.fixed')!;
    fireEvent.mouseLeave(container);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows loading state initially', () => {
    render(
      <CardImagePopover cardId="EX1_277" anchorRect={getMockRect()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });
});
