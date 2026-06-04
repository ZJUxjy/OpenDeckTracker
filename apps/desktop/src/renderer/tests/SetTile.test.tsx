import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SetProgress } from '@hdt/core';

import { SetTile } from '../src/components/SetTile';
import { I18nProvider } from '../src/i18n';

function row(overrides: Partial<SetProgress> & { setCode: string }): SetProgress {
  return {
    setCode: overrides.setCode,
    format: overrides.format ?? 'standard',
    totalCards: overrides.totalCards ?? 100,
    totalCopies: overrides.totalCopies ?? 200,
    ownedCopies: overrides.ownedCopies ?? 0,
    ownedUniqueCards: overrides.ownedUniqueCards ?? 0,
  };
}

function renderTile(props: Partial<React.ComponentProps<typeof SetTile>> & { row: SetProgress }) {
  return render(
    <I18nProvider preference="en-US">
      <SetTile
        label="Test Set"
        accent="#15803D"
        mini={false}
        onClick={() => undefined}
        {...props}
      />
    </I18nProvider>,
  );
}

describe('SetTile', () => {
  it('renders 唯一卡牌 and 总收藏数 stat rows with correct values', () => {
    renderTile({
      row: row({
        setCode: 'SET_X',
        ownedUniqueCards: 254,
        totalCards: 263,
        ownedCopies: 110,
        totalCopies: 526,
      }),
    });
    expect(screen.getByTestId('tile-unique-value').textContent).toBe('254 / 263');
    expect(screen.getByTestId('tile-copies-value').textContent).toBe('110 / 526');
  });

  it('shows Complete badge only when ownedCopies === totalCopies', () => {
    const { rerender } = renderTile({
      row: row({ setCode: 'A', ownedCopies: 526, totalCopies: 526, ownedUniqueCards: 263, totalCards: 263 }),
    });
    expect(screen.queryByTestId('tile-complete-badge')).toBeInTheDocument();

    rerender(
      <I18nProvider preference="en-US">
        <SetTile
          row={row({ setCode: 'A', ownedCopies: 50, totalCopies: 526 })}
          label="Partial"
          accent="#15803D"
          mini={false}
          onClick={() => undefined}
        />
      </I18nProvider>,
    );
    expect(screen.queryByTestId('tile-complete-badge')).not.toBeInTheDocument();
  });

  it('applies partial tone to copies value when ownedCopies is partial', () => {
    renderTile({
      row: row({ setCode: 'B', ownedCopies: 100, totalCopies: 526 }),
    });
    expect(screen.getByTestId('tile-copies-value')).toHaveAttribute('data-tone', 'partial');
  });

  it('applies empty tone to copies value when ownedCopies is zero', () => {
    renderTile({
      row: row({ setCode: 'C', ownedCopies: 0, totalCopies: 526 }),
    });
    expect(screen.getByTestId('tile-copies-value')).toHaveAttribute('data-tone', 'empty');
  });

  it('shows MINI-SET badge when mini prop is true', () => {
    renderTile({
      row: row({ setCode: 'D' }),
      mini: true,
    });
    expect(screen.getByTestId('tile-mini-badge')).toBeInTheDocument();
  });

  it('renders a subdued set background image when provided', () => {
    renderTile({
      row: row({ setCode: 'SET_1869' }),
      backgroundImageUrl: 'asset://march-of-the-lich-king-bg.png',
    });
    const background = screen.getByTestId('tile-cover-background') as HTMLImageElement;
    expect(background.src).toBe('asset://march-of-the-lich-king-bg.png');
    expect(background.className).toContain('reference-exp-cover-bg');
  });

  it('calls onClick with set code when clicked', () => {
    const onClick = vi.fn();
    renderTile({
      row: row({ setCode: 'SET_X' }),
      onClick,
    });
    fireEvent.click(screen.getByTestId('set-tile-SET_X'));
    expect(onClick).toHaveBeenCalledWith('SET_X');
  });
});
