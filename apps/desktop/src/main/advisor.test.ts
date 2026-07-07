import type { DeckTrackerEvent, DeckTrackerSnapshot } from '@hdt/core';
import type { AdvisorSuggestion } from '@hdt/advisor';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startAdvisor } from './advisor';
import type { AdvisorTrackerLike } from './advisor';

const suggestion: AdvisorSuggestion = {
  actions: [{ kind: 'endTurn', note: 'Pass.' }],
  reasoning: 'No profitable action.',
  alerts: [],
};

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function trackerHarness(): {
  tracker: AdvisorTrackerLike;
  emit: (event: DeckTrackerEvent['type'], snapshot: DeckTrackerSnapshot) => void;
} {
  const handlers = new Map<string, ((event: DeckTrackerEvent) => void)[]>();
  return {
    tracker: {
      on: (event, handler) => {
        const list = handlers.get(event) ?? [];
        list.push(handler as (event: DeckTrackerEvent) => void);
        handlers.set(event, list);
        return () => undefined;
      },
    },
    emit: (event, snapshot) => {
      for (const handler of handlers.get(event) ?? []) {
        handler({ type: event, snapshot });
      }
    },
  };
}

function snapshot(overrides: Partial<DeckTrackerSnapshot> = {}): DeckTrackerSnapshot {
  return {
    phase: 'IN_MATCH',
    turn: 1,
    isMulligan: false,
    boardAttackToFace: { friendly: 0, opposing: 0 },
    opposingHero: { health: 30, armor: 0, effectiveHealth: 30 },
    updatedAt: 1,
    ...overrides,
  } as DeckTrackerSnapshot;
}

describe('advisor main service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('broadcasts deterministic lethal alerts without waiting for the LLM', () => {
    const { tracker, emit } = trackerHarness();
    const broadcast = vi.fn();

    startAdvisor({
      tracker,
      broadcast,
      createSession: () => null,
    });
    emit('state-change', snapshot({
      boardAttackToFace: { friendly: 6, opposing: 0 },
      opposingHero: { health: 4, armor: 2, effectiveHealth: 6 },
    }));

    expect(broadcast).toHaveBeenCalledWith(
      'advisor:state',
      expect.objectContaining({
        status: 'ready',
        suggestion: null,
        alerts: [{ type: 'lethal', detail: '6 damage available against 6 effective health.' }],
      }),
    );
  });

  it('triggers a mulligan suggestion only once per match', async () => {
    const { tracker, emit } = trackerHarness();
    const broadcast = vi.fn();
    const session = {
      suggestMulligan: vi.fn(async () => suggestion),
      suggestTurn: vi.fn(async () => suggestion),
      abortInFlight: vi.fn(),
    };

    startAdvisor({
      tracker,
      broadcast,
      createSession: () => session,
    });
    emit('match-started', snapshot({ isMulligan: true }));
    emit('state-change', snapshot({ isMulligan: true }));
    emit('state-change', snapshot({ isMulligan: true }));
    await vi.runAllTimersAsync();

    expect(session.suggestMulligan).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledWith(
      'advisor:state',
      expect.objectContaining({ status: 'ready', suggestion }),
    );
  });

  it('debounces current-turn suggestions until the snapshot settles', async () => {
    const { tracker, emit } = trackerHarness();
    const broadcast = vi.fn();
    const session = {
      suggestMulligan: vi.fn(async () => suggestion),
      suggestTurn: vi.fn(async () => suggestion),
      abortInFlight: vi.fn(),
    };

    startAdvisor({
      tracker,
      broadcast,
      createSession: () => session,
      shouldSuggestTurn: (current) => current.turn === 3,
      debounceMs: 1_000,
    });
    emit('match-started', snapshot());
    emit('state-change', snapshot({ turn: 3 }));

    expect(session.suggestTurn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(999);
    expect(session.suggestTurn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(session.suggestTurn).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenNthCalledWith(
      1,
      'advisor:state',
      expect.objectContaining({ status: 'loading', suggestion: null }),
    );
    expect(broadcast).toHaveBeenLastCalledWith(
      'advisor:state',
      expect.objectContaining({ status: 'ready', suggestion }),
    );
  });

  it('marks an in-flight turn suggestion stale when the turn changes', async () => {
    const { tracker, emit } = trackerHarness();
    const broadcast = vi.fn();
    const pending = deferred<AdvisorSuggestion>();
    const session = {
      suggestMulligan: vi.fn(async () => suggestion),
      suggestTurn: vi.fn(() => pending.promise),
      abortInFlight: vi.fn(),
    };

    startAdvisor({
      tracker,
      broadcast,
      createSession: () => session,
      shouldSuggestTurn: (current) => current.turn === 3,
      debounceMs: 0,
    });
    emit('match-started', snapshot({ turn: 2 }));
    emit('state-change', snapshot({ turn: 3 }));
    await vi.runAllTimersAsync();

    emit('state-change', snapshot({ turn: 4 }));
    pending.resolve(suggestion);
    await vi.runAllTimersAsync();

    expect(session.abortInFlight).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledWith(
      'advisor:state',
      expect.objectContaining({ status: 'stale', suggestion: null }),
    );
    expect(broadcast).not.toHaveBeenLastCalledWith(
      'advisor:state',
      expect.objectContaining({ status: 'ready', suggestion }),
    );
  });

  it('aborts pending advisor work at match end and keeps late results out of state', async () => {
    const { tracker, emit } = trackerHarness();
    const broadcast = vi.fn();
    const pending = deferred<AdvisorSuggestion>();
    const session = {
      suggestMulligan: vi.fn(async () => suggestion),
      suggestTurn: vi.fn(() => pending.promise),
      abortInFlight: vi.fn(),
    };

    startAdvisor({
      tracker,
      broadcast,
      createSession: () => session,
      shouldSuggestTurn: (current) => current.turn === 3,
      debounceMs: 0,
    });
    emit('match-started', snapshot({ turn: 2 }));
    emit('state-change', snapshot({ turn: 3 }));
    await vi.runAllTimersAsync();

    emit('match-ended', snapshot({ phase: 'IDLE', turn: 3 }));
    pending.resolve(suggestion);
    await vi.runAllTimersAsync();

    expect(session.abortInFlight).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenLastCalledWith(
      'advisor:state',
      expect.objectContaining({ status: 'idle', suggestion: null }),
    );
  });
});
