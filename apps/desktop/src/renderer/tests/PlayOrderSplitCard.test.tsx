import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PlayOrderSplit } from '@hdt/core';

import { PlayOrderSplitCard } from '../src/components/PlayOrderSplitCard';
import { I18nProvider } from '../src/i18n';

function renderCard(split: PlayOrderSplit | null) {
  return render(
    <I18nProvider preference="en-US">
      <PlayOrderSplitCard split={split} />
    </I18nProvider>,
  );
}

describe('PlayOrderSplitCard', () => {
  it('renders both first and coin buckets always', () => {
    const split: PlayOrderSplit = {
      first: { wins: 7, losses: 3, winrate: 70 },
      coin: { wins: 2, losses: 4, winrate: 33.3 },
      unknown: { wins: 0, losses: 0, winrate: null },
    };
    renderCard(split);
    expect(screen.getByTestId('play-order-first')).toBeInTheDocument();
    expect(screen.getByTestId('play-order-coin')).toBeInTheDocument();
  });

  it('hides the unknown bucket when empty', () => {
    const split: PlayOrderSplit = {
      first: { wins: 1, losses: 0, winrate: 100 },
      coin: { wins: 0, losses: 0, winrate: null },
      unknown: { wins: 0, losses: 0, winrate: null },
    };
    renderCard(split);
    expect(screen.queryByTestId('play-order-unknown')).toBeNull();
  });

  it('shows the unknown bucket when populated', () => {
    const split: PlayOrderSplit = {
      first: { wins: 0, losses: 0, winrate: null },
      coin: { wins: 0, losses: 0, winrate: null },
      unknown: { wins: 1, losses: 0, winrate: 100 },
    };
    renderCard(split);
    expect(screen.getByTestId('play-order-unknown')).toBeInTheDocument();
  });

  it('renders dash for null winrate', () => {
    const split: PlayOrderSplit = {
      first: { wins: 0, losses: 0, winrate: null },
      coin: { wins: 0, losses: 0, winrate: null },
      unknown: { wins: 0, losses: 0, winrate: null },
    };
    renderCard(split);
    expect(screen.getByTestId('play-order-first').textContent).toContain('—');
  });

  it('handles null split prop with safe defaults', () => {
    renderCard(null);
    expect(screen.getByTestId('play-order-first')).toBeInTheDocument();
  });
});
