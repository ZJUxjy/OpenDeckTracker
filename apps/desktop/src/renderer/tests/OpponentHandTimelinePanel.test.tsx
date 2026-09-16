import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { DeckTrackerSnapshot } from '@hdt/core';
import { I18nProvider } from '../src/i18n';
import { OpponentHandTimelinePanel } from '../src/components/OpponentHandTimelinePanel';
import { useDeckTrackerStore } from '../src/stores/deck-tracker-store';

vi.mock('../src/hooks/use-card-def', () => ({ useCardDef: (id: string) => id ? { name: id } : null }));
beforeEach(() => useDeckTrackerStore.setState({ snapshot: null }));

it('shows public sources, unknown identity and incomplete history without making up cards', () => {
  const state = { turn: 8, opposingHandCount: 2, opposingHandTimeline: [
    { entityId: 10, cardId: null, position: 1, acquiredTurn: 4, origin: 'generated', keptFromMulligan: null, sourceCardId: 'Public source' },
  ] } as DeckTrackerSnapshot;
  useDeckTrackerStore.setState({ snapshot: state });
  render(<I18nProvider preference="en-US"><OpponentHandTimelinePanel /></I18nProvider>);
  expect(screen.getByText('Position 1 · Unknown card')).toBeInTheDocument();
  expect(screen.getByText(/Acquired on turn 4/)).toBeInTheDocument();
  expect(screen.getByText('Created by Public source')).toBeInTheDocument();
  expect(screen.getByText(/Observed 1 cards; reported hand size 2/)).toBeInTheDocument();
  act(() => useDeckTrackerStore.setState({ snapshot: null }));
  expect(screen.queryByText('Created by Public source')).not.toBeInTheDocument();
  expect(screen.getByText('No current hand cards observed yet.')).toBeInTheDocument();
});
