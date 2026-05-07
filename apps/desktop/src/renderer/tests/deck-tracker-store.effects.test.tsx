import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ActiveEffect, DeckTrackerSnapshot } from '@hdt/core';
import {
  useDeckTrackerStore,
  useFriendlyEffects,
  useOpposingEffects,
} from '../src/stores/deck-tracker-store';

function blankSnap(extra: Partial<DeckTrackerSnapshot> = {}): DeckTrackerSnapshot {
  return {
    phase: 'IDLE',
    matchInfo: null,
    deck: null,
    pendingDeckSelection: null,
    friendlyHand: [],
    opposingHandCount: 0,
    opponent: { revealed: [], graveyard: [] },
    friendlyDeckCount: 0,
    friendlyEffects: [],
    opposingEffects: [],
    error: null,
    updatedAt: 0,
    ...extra,
  };
}

beforeEach(() => {
  useDeckTrackerStore.setState({
    snapshot: null,
    pendingSelection: null,
    dialogDismissed: false,
  });
});

afterEach(() => {
  useDeckTrackerStore.setState({
    snapshot: null,
    pendingSelection: null,
    dialogDismissed: false,
  });
});

describe('useFriendlyEffects / useOpposingEffects', () => {
  it('returns empty arrays when snapshot is null', () => {
    const { result: friendly } = renderHook(() => useFriendlyEffects());
    const { result: opposing } = renderHook(() => useOpposingEffects());
    expect(friendly.current).toEqual([]);
    expect(opposing.current).toEqual([]);
  });

  it('returns empty arrays when snapshot omits the effects fields (legacy)', () => {
    const legacy = blankSnap();
    // Simulate older main-process build that didn't ship effects fields.
    delete (legacy as { friendlyEffects?: unknown }).friendlyEffects;
    delete (legacy as { opposingEffects?: unknown }).opposingEffects;
    act(() => {
      useDeckTrackerStore.setState({ snapshot: legacy });
    });
    const { result: friendly } = renderHook(() => useFriendlyEffects());
    const { result: opposing } = renderHook(() => useOpposingEffects());
    expect(friendly.current).toEqual([]);
    expect(opposing.current).toEqual([]);
  });

  it('reflects active effects from a populated snapshot', () => {
    const fx: ActiveEffect = {
      id: 'cleansing-cleric',
      sourceCardId: 'CATA_216',
      triggeredAt: 1000,
    };
    act(() => {
      useDeckTrackerStore.setState({
        snapshot: blankSnap({ friendlyEffects: [fx] }),
      });
    });
    const { result } = renderHook(() => useFriendlyEffects());
    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.id).toBe('cleansing-cleric');
  });

  it('selectors are referentially stable across re-renders with unchanged snapshot', () => {
    const fx: ActiveEffect = {
      id: 'cleansing-cleric',
      sourceCardId: 'CATA_216',
      triggeredAt: 1000,
    };
    const snap = blankSnap({ friendlyEffects: [fx] });
    act(() => {
      useDeckTrackerStore.setState({ snapshot: snap });
    });
    const { result, rerender } = renderHook(() => useFriendlyEffects());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
