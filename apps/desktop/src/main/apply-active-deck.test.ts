import { describe, expect, it, vi } from 'vitest';
import { applyActiveDeck } from './apply-active-deck';

const deck = {
  id: 'deck-1', name: 'Test', version: 3,
  cards: [{ cardId: 'CS2_062', count: 2 }, { cardId: 'CS2_063', count: 1 }],
};

function fakeTracker() {
  return {
    setOriginalDeck: vi.fn(),
    selectSavedDeck: vi.fn(),
    getLocalOriginalDeck: vi.fn<() => unknown | null>(() => null),
  };
}

describe('applyActiveDeck', () => {
  it('sets originalDeck + saved-deck attribution when an active deck is configured', () => {
    const tracker = fakeTracker();
    applyActiveDeck({ tracker, mirrorAbsent: true, getActiveDeckId: () => 'deck-1', getDeckById: () => deck });
    expect(tracker.setOriginalDeck).toHaveBeenCalledTimes(1);
    const arg = tracker.setOriginalDeck.mock.calls[0]![0]!;
    expect(arg.name).toBe('Test');
    expect(arg.deckId).toBe(0);
    expect(tracker.selectSavedDeck).toHaveBeenCalledWith('deck-1', 3);
  });

  it('does nothing on Windows (mirror present)', () => {
    const tracker = fakeTracker();
    applyActiveDeck({ tracker, mirrorAbsent: false, getActiveDeckId: () => 'deck-1', getDeckById: () => deck });
    expect(tracker.setOriginalDeck).not.toHaveBeenCalled();
  });

  it('does nothing when no active deck is set', () => {
    const tracker = fakeTracker();
    applyActiveDeck({ tracker, mirrorAbsent: true, getActiveDeckId: () => null, getDeckById: () => deck });
    expect(tracker.setOriginalDeck).not.toHaveBeenCalled();
  });

  it('does not overwrite an already-identified deck', () => {
    const tracker = fakeTracker();
    tracker.getLocalOriginalDeck = vi.fn(() => ({}));
    applyActiveDeck({ tracker, mirrorAbsent: true, getActiveDeckId: () => 'deck-1', getDeckById: () => deck });
    expect(tracker.setOriginalDeck).not.toHaveBeenCalled();
  });
});
