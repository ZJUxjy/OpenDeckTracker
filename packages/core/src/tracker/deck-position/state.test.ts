import { describe, it, expect } from 'vitest';
import { MatchDeckPositionState } from './state';

describe('MatchDeckPositionState', () => {
  it('records placements with auto-incrementing insertedAt', () => {
    const state = new MatchDeckPositionState();
    state.recordPlacements([
      { cardId: 'CARD_A', controllerId: 1, placement: 'bottom', sourceCardId: 'TIME_701' },
      { cardId: 'CARD_B', controllerId: 1, placement: 'bottom', sourceCardId: 'TIME_701' },
    ]);
    const snap = state.snapshot();
    expect(snap).toHaveLength(2);
    expect(snap[0]).toMatchObject({ cardId: 'CARD_A', insertedAt: 0 });
    expect(snap[1]).toMatchObject({ cardId: 'CARD_B', insertedAt: 1 });
  });

  it('snapshot orders by insertedAt regardless of insertion grouping', () => {
    const state = new MatchDeckPositionState();
    state.recordPlacements([
      { cardId: 'CARD_A', controllerId: 1, placement: 'bottom', sourceCardId: 'X' },
    ]);
    state.recordPlacements([
      { cardId: 'CARD_B', controllerId: 1, placement: 'bottom', sourceCardId: 'X' },
      { cardId: 'CARD_C', controllerId: 1, placement: 'bottom', sourceCardId: 'X' },
    ]);
    const snap = state.snapshot();
    expect(snap.map((e) => e.cardId)).toEqual(['CARD_A', 'CARD_B', 'CARD_C']);
    expect(snap.map((e) => e.insertedAt)).toEqual([0, 1, 2]);
  });

  it('snapshot filters by controllerId when provided', () => {
    const state = new MatchDeckPositionState();
    state.recordPlacements([
      { cardId: 'CARD_A', controllerId: 1, placement: 'bottom', sourceCardId: 'X' },
      { cardId: 'CARD_B', controllerId: 2, placement: 'bottom', sourceCardId: 'X' },
    ]);
    const local = state.snapshot(1);
    expect(local.map((e) => e.cardId)).toEqual(['CARD_A']);
    const opposing = state.snapshot(2);
    expect(opposing.map((e) => e.cardId)).toEqual(['CARD_B']);
  });

  it('reconcileWithDeckCounts is a no-op when markers fit', () => {
    const state = new MatchDeckPositionState();
    state.recordPlacements([
      { cardId: 'CARD_A', controllerId: 1, placement: 'bottom', sourceCardId: 'X' },
      { cardId: 'CARD_A', controllerId: 1, placement: 'bottom', sourceCardId: 'X' },
    ]);
    state.reconcileWithDeckCounts(new Map([['CARD_A', 2]]), 1);
    expect(state.snapshot()).toHaveLength(2);
  });

  it('reconcileWithDeckCounts trims oldest marker when deck count falls short', () => {
    const state = new MatchDeckPositionState();
    state.recordPlacements([
      { cardId: 'CARD_A', controllerId: 1, placement: 'bottom', sourceCardId: 'X' },
      { cardId: 'CARD_A', controllerId: 1, placement: 'bottom', sourceCardId: 'X' },
    ]);
    // One CARD_A got drawn — deck only has 1 left
    state.reconcileWithDeckCounts(new Map([['CARD_A', 1]]), 1);
    const remaining = state.snapshot();
    expect(remaining).toHaveLength(1);
    // Trimmed the OLDER one (insertedAt 0), kept insertedAt 1
    expect(remaining[0]!.insertedAt).toBe(1);
  });

  it('reconcileWithDeckCounts drops all markers when deck has zero left', () => {
    const state = new MatchDeckPositionState();
    state.recordPlacements([
      { cardId: 'CARD_A', controllerId: 1, placement: 'bottom', sourceCardId: 'X' },
      { cardId: 'CARD_A', controllerId: 1, placement: 'bottom', sourceCardId: 'X' },
    ]);
    state.reconcileWithDeckCounts(new Map(), 1);
    expect(state.snapshot()).toEqual([]);
  });

  it('reconcileWithDeckCounts ignores markers on a different controller', () => {
    const state = new MatchDeckPositionState();
    state.recordPlacements([
      { cardId: 'CARD_A', controllerId: 1, placement: 'bottom', sourceCardId: 'X' },
      { cardId: 'CARD_A', controllerId: 2, placement: 'bottom', sourceCardId: 'X' },
    ]);
    // Pass remainingCounts for controller 1 (the local side) only
    state.reconcileWithDeckCounts(new Map(), 1);
    const all = state.snapshot();
    expect(all).toHaveLength(1);
    expect(all[0]!.controllerId).toBe(2);
  });

  it('reset clears state and resets the sequence', () => {
    const state = new MatchDeckPositionState();
    state.recordPlacements([
      { cardId: 'CARD_A', controllerId: 1, placement: 'bottom', sourceCardId: 'X' },
    ]);
    state.reset();
    expect(state.snapshot()).toEqual([]);
    state.recordPlacements([
      { cardId: 'CARD_B', controllerId: 1, placement: 'bottom', sourceCardId: 'X' },
    ]);
    expect(state.snapshot()[0]!.insertedAt).toBe(0);
  });
});
