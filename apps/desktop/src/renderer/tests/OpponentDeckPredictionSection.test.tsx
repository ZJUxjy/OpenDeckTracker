import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  OpponentCardRecord,
  OpponentDeckPrediction,
  PopularDeckCardEntry,
  PopularDeckEnriched,
} from '@hdt/core';
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
    deckCardList: over.deckCardList ?? [],
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
  revealed: OpponentCardRecord[] = [],
) {
  return render(
    <I18nProvider preference="en-US">
      <OpponentDeckPredictionSection
        predictions={predictions}
        excludedCount={excludedCount}
        observedCount={observedCount}
        revealed={revealed}
      />
    </I18nProvider>,
  );
}

function entry(over: Partial<PopularDeckCardEntry> & { cardId: string; name: string }): PopularDeckCardEntry {
  return {
    cardId: over.cardId,
    name: over.name,
    cost: over.cost ?? 4,
    count: over.count ?? 2,
  };
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

  it('clicking the top row opens the deck popup with one row per copy', async () => {
    const user = userEvent.setup();
    const fireball = entry({ cardId: 'CS2_029', name: 'Fireball', cost: 4, count: 2 });
    const polymorph = entry({ cardId: 'NEW_010', name: 'Polymorph', cost: 4, count: 1 });
    const arcane = entry({ cardId: 'CS2_023', name: 'Arcane Intellect', cost: 3, count: 2 });
    const d = deck({
      id: 'mage-fb',
      deckCardList: [fireball, polymorph, arcane],
    });
    const revealed: OpponentCardRecord[] = [
      // 1× Fireball played (partial — deck has 2)
      { entityId: 1, cardId: 'CS2_029', zone: 'PLAY', order: 1, created: false },
      // 1× Polymorph played (full — deck has 1)
      { entityId: 2, cardId: 'NEW_010', zone: 'PLAY', order: 2, created: false },
      // discovered Arcane Intellect — must NOT count toward played
      { entityId: 3, cardId: 'CS2_023', zone: 'PLAY', order: 3, created: true },
    ];
    renderSection([pred({ deck: d })], 0, 3, revealed);

    await act(async () => {
      await user.click(screen.getByTestId('opponent-prediction-top'));
    });

    const popup = await screen.findByTestId('opponent-prediction-popup');
    expect(popup).toBeInTheDocument();
    // 2 + 1 + 2 = 5 rows total (one per copy)
    const rows = screen.getAllByTestId('opponent-prediction-popup-row');
    expect(rows).toHaveLength(5);

    const fireballRows = rows.filter((r) => r.getAttribute('data-card-id') === 'CS2_029');
    expect(fireballRows).toHaveLength(2);
    // First copy played, second still in deck
    expect(fireballRows[0]!.getAttribute('data-played')).toBe('true');
    expect(fireballRows[1]!.getAttribute('data-played')).toBe('false');

    const polymorphRows = rows.filter((r) => r.getAttribute('data-card-id') === 'NEW_010');
    expect(polymorphRows).toHaveLength(1);
    expect(polymorphRows[0]!.getAttribute('data-played')).toBe('true');

    const arcaneRows = rows.filter((r) => r.getAttribute('data-card-id') === 'CS2_023');
    expect(arcaneRows).toHaveLength(2);
    // Discovered Arcane Intellect must not count toward played
    expect(arcaneRows.every((r) => r.getAttribute('data-played') === 'false')).toBe(true);
  });

  it('clicking the same row again closes the popup', async () => {
    const user = userEvent.setup();
    renderSection([pred({ deck: deck({ id: 'a', deckCardList: [entry({ cardId: 'X', name: 'X' })] }) })], 0, 1);
    await act(async () => {
      await user.click(screen.getByTestId('opponent-prediction-top'));
    });
    expect(screen.getByTestId('opponent-prediction-popup')).toBeInTheDocument();
    await act(async () => {
      await user.click(screen.getByTestId('opponent-prediction-top'));
    });
    expect(screen.queryByTestId('opponent-prediction-popup')).toBeNull();
  });

  it('Escape key closes the popup', async () => {
    const user = userEvent.setup();
    renderSection([pred({ deck: deck({ id: 'a', deckCardList: [entry({ cardId: 'X', name: 'X' })] }) })], 0, 1);
    await act(async () => {
      await user.click(screen.getByTestId('opponent-prediction-top'));
    });
    expect(screen.getByTestId('opponent-prediction-popup')).toBeInTheDocument();
    await act(async () => {
      await user.keyboard('{Escape}');
    });
    expect(screen.queryByTestId('opponent-prediction-popup')).toBeNull();
  });
});
