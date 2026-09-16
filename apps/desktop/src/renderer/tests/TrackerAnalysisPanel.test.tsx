import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckTrackerSnapshot } from '@hdt/core';
import { I18nProvider } from '../src/i18n';
import { TrackerAnalysisPanel } from '../src/components/TrackerAnalysisPanel';
import { useDeckTrackerStore } from '../src/stores/deck-tracker-store';

vi.mock('../src/hooks/use-card-def', () => ({ useCardDef: (id: string) => ({ name: id }) }));
const cards = [{ cardId: 'A', count: 2 }, { cardId: 'B', count: 1 }, { cardId: 'C', count: 7 }];
function snapshot(id = 1): DeckTrackerSnapshot {
  return {
    phase: 'IN_MATCH', turn: 1, isMulligan: false, matchInfo: null, matchStartedAt: 1,
    deck: { id, name: 'Test', original: cards, remaining: cards, extras: [], extraRemaining: [], knownPositions: [] },
    pendingDeckSelection: null, friendlyHand: ['B'], friendlyHandExtras: [false], opposingHandCount: 3,
    opponent: { revealed: [], graveyard: [] }, opponentClass: null, friendlyGraveyard: [], friendlyDeckCount: 10,
    friendlyEffects: [], opposingEffects: [], boardAttack: { friendly: 0, opposing: 0 },
    boardAttackToFace: { friendly: 0, opposing: 0 }, error: null, updatedAt: 1,
  };
}
const mount = () => render(<I18nProvider preference="en-US"><TrackerAnalysisPanel /></I18nProvider>);

describe('TrackerAnalysisPanel', () => {
  beforeEach(() => { localStorage.clear(); useDeckTrackerStore.setState({ snapshot: snapshot() }); });
  it('calculates any/all goals from user selection and restores preferences', () => {
    const view = mount();
    expect(screen.getByTestId('draw-odds-0')).toHaveTextContent('—');
    fireEvent.click(screen.getByLabelText('A'));
    expect(screen.getByTestId('draw-odds-0')).toHaveTextContent('20%');
    fireEvent.click(screen.getByLabelText('B'));
    fireEvent.change(screen.getByLabelText('Planned draws'), { target: { value: '2' } });
    expect(screen.getByTestId('draw-odds-2')).toHaveTextContent('53.3%');
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'all' } });
    expect(screen.getByTestId('draw-odds-2')).toHaveTextContent('4.4%');
    view.unmount(); mount();
    expect(screen.getByLabelText('A')).toBeChecked();
    expect(screen.getByTestId('draw-odds-2')).toHaveTextContent('4.4%');
    fireEvent.click(screen.getByLabelText('Count selected cards already in hand toward the goal'));
    expect(screen.getByTestId('draw-odds-2')).toHaveTextContent('37.8%');
  });
  it('keeps different deck selections separate and restores on return', () => {
    mount(); fireEvent.click(screen.getByLabelText('A'));
    act(() => useDeckTrackerStore.setState({ snapshot: snapshot(2) }));
    expect(screen.getByLabelText('A')).not.toBeChecked();
    act(() => useDeckTrackerStore.setState({ snapshot: snapshot(1) }));
    expect(screen.getByLabelText('A')).toBeChecked();
  });
  it('handles absent and inconsistent live state', () => {
    mount();
    act(() => useDeckTrackerStore.setState({ snapshot: { ...snapshot(), friendlyDeckCount: 9 } }));
    expect(screen.getByText(/observations are incomplete/)).toBeInTheDocument();
    act(() => useDeckTrackerStore.setState({ snapshot: null }));
    expect(screen.getByText(/Start a match/)).toBeInTheDocument();
  });
  it('uses known positions rather than unconditional random odds', () => {
    const state = snapshot();
    state.deck!.knownPositions = [{ cardId: 'B', placement: 'bottom', insertedAt: 1, controllerId: 1, sourceCardId: 'source' }];
    useDeckTrackerStore.setState({ snapshot: state });
    mount(); fireEvent.click(screen.getByLabelText('B'));
    expect(screen.getByTestId('draw-odds-0')).toHaveTextContent('0%');
    fireEvent.change(screen.getByLabelText('Planned draws'), { target: { value: '10' } });
    expect(screen.getByTestId('draw-odds-2')).toHaveTextContent('100%');
  });
  it('forecasts observed draw risks and labels manual overrides', () => {
    useDeckTrackerStore.setState({ snapshot: { ...snapshot(), friendlyDeckCount: 2,
      friendlyHand: Array.from({ length: 9 }, () => 'C'),
      friendlyDrawContext: { fatigueTaken: 2, handLimit: 10, fatigueImmune: false } } });
    mount();
    fireEvent.change(screen.getByLabelText('Planned draws'), { target: { value: '4' } });
    expect(screen.getByTestId('draw-risk-results')).toHaveTextContent('1 enter hand, 1 burn, 7 fatigue damage');
    fireEvent.change(screen.getByLabelText('Hand limit (override)'), { target: { value: '12' } });
    expect(screen.getByTestId('draw-risk-results')).toHaveTextContent('2 enter hand, 0 burn, 7 fatigue damage');
    fireEvent.change(screen.getByLabelText('Hand limit (override)'), { target: { value: '' } });
    expect(screen.getByTestId('draw-risk-results')).toHaveTextContent('1 enter hand, 1 burn, 7 fatigue damage');
  });
});
