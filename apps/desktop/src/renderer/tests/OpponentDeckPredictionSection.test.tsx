import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OpponentDeckPrediction, PopularDeckEnriched } from '@hdt/core';
import { OpponentDeckPredictionSection } from '../src/components/OpponentDeckPredictionSection';
import { I18nProvider } from '../src/i18n';

function deck(over: Partial<PopularDeckEnriched> & { id: string }): PopularDeckEnriched {
  return {
    id: over.id,
    name: over.name ?? over.id,
    class: over.class ?? 'MAGE',
    format: over.format ?? 'Standard',
    archetype: over.archetype ?? 'Tempo',
    deckstring: over.deckstring ?? `DS:${over.id}`,
    winratePercent: over.winratePercent ?? 50.5,
    gamesCount: over.gamesCount ?? 1000,
    author: 'hsguru',
    updatedAt: '2026-05-09',
    manaCurve: [0, 0, 0, 0, 0, 0, 0, 0],
    keyCards: [],
    cardNames: [],
    dustCost: 0,
  };
}

function pred(over: Partial<OpponentDeckPrediction> & { deck: PopularDeckEnriched }): OpponentDeckPrediction {
  return {
    deck: over.deck,
    score: over.score ?? 0.8,
    matchedCount: over.matchedCount ?? 4,
    observedOriginalCount: over.observedOriginalCount ?? 5,
    confidence: over.confidence ?? 'medium',
  };
}

function renderSection(
  predictions: OpponentDeckPrediction[],
  excludedCount = 0,
  observedCount = 0,
) {
  return render(
    <I18nProvider preference="en-US">
      <OpponentDeckPredictionSection
        predictions={predictions}
        excludedCount={excludedCount}
        observedCount={observedCount}
      />
    </I18nProvider>,
  );
}

describe('OpponentDeckPredictionSection', () => {
  it('is hidden in DOM before any opponent plays (no predictions, no observations)', () => {
    renderSection([], 0, 0);
    expect(screen.queryByTestId('opponent-deck-prediction-section')).toBeNull();
  });

  it('shows "No matching popular decks" when observed > 0 but predictions empty', () => {
    renderSection([], 0, 3);
    expect(screen.getByTestId('opponent-prediction-no-match')).toBeInTheDocument();
  });

  it('renders the top prediction with name, archetype/wr, score, confidence', () => {
    renderSection(
      [
        pred({
          deck: deck({ id: 'mage-fb', name: 'Tempo Mage', class: 'MAGE', archetype: 'Tempo', winratePercent: 53 }),
          score: 0.821,
          confidence: 'high',
        }),
      ],
      0,
      5,
    );
    const top = screen.getByTestId('opponent-prediction-top');
    expect(top).toBeInTheDocument();
    expect(top).toHaveTextContent('Tempo Mage');
    // archetype is rendered as `Tempo` (CSS uppercase doesn't affect textContent)
    expect(top).toHaveTextContent('Tempo');
    expect(top).toHaveTextContent('53%');
    expect(top).toHaveTextContent('82.1% match');
    const badge = screen.getByTestId('opponent-prediction-confidence');
    expect(badge).toHaveAttribute('data-confidence', 'high');
  });

  it('shows excluded-cards count when ≥ 1', () => {
    renderSection(
      [pred({ deck: deck({ id: 'mage-fb' }) })],
      2,
      5,
    );
    expect(screen.getByTestId('opponent-prediction-excluded')).toHaveTextContent(
      'Excluded 2 created cards',
    );
  });

  it('does not show excluded label when count is 0', () => {
    renderSection([pred({ deck: deck({ id: 'mage-fb' }) })], 0, 5);
    expect(screen.queryByTestId('opponent-prediction-excluded')).toBeNull();
  });

  it('expands to reveal alternatives 2..N', async () => {
    const user = userEvent.setup();
    renderSection(
      [
        pred({ deck: deck({ id: 'a', name: 'A' }) }),
        pred({ deck: deck({ id: 'b', name: 'B' }) }),
        pred({ deck: deck({ id: 'c', name: 'C' }) }),
      ],
      0,
      5,
    );
    expect(screen.queryAllByTestId('opponent-prediction-alt')).toHaveLength(0);
    await act(async () => {
      await user.click(screen.getByTestId('opponent-prediction-toggle'));
    });
    expect(screen.queryAllByTestId('opponent-prediction-alt')).toHaveLength(2);
  });

  it('hides toggle when only 1 prediction', () => {
    renderSection([pred({ deck: deck({ id: 'a' }) })], 0, 5);
    expect(screen.queryByTestId('opponent-prediction-toggle')).toBeNull();
  });
});
