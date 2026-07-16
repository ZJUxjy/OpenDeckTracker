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

  it('does not re-broadcast the same lethal alert on consecutive snapshots', () => {
    const { tracker, emit } = trackerHarness();
    const broadcast = vi.fn();

    startAdvisor({
      tracker,
      broadcast,
      createSession: () => null,
    });
    const lethalSnap = snapshot({
      boardAttackToFace: { friendly: 6, opposing: 0 },
      opposingHero: { health: 4, armor: 2, effectiveHealth: 6 },
    });
    emit('state-change', lethalSnap);
    const callsBefore = broadcast.mock.calls.length;
    emit('state-change', lethalSnap);

    expect(broadcast.mock.calls.length).toBe(callsBefore);
  });

  it('preserves current suggestion when broadcasting a lethal alert', async () => {
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
      shouldSuggestTurn: (current) => current.turn === 1,
      debounceMs: 0,
    });
    emit('match-started', snapshot({ turn: 1 }));
    emit('state-change', snapshot({ turn: 1 }));
    await vi.runAllTimersAsync();

    broadcast.mockClear();
    emit('state-change', snapshot({
      turn: 1,
      boardAttackToFace: { friendly: 6, opposing: 0 },
      opposingHero: { health: 4, armor: 2, effectiveHealth: 6 },
    }));

    expect(broadcast).toHaveBeenCalledWith(
      'advisor:state',
      expect.objectContaining({
        status: 'ready',
        suggestion,
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

  it('does not trigger turn suggestions during the opponent\'s turn', async () => {
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
      debounceMs: 0,
    });
    // Start at turn 0; local player's turn 1 should trigger.
    emit('match-started', snapshot({ turn: 0, isLocalTurn: true }));
    emit('state-change', snapshot({ turn: 1, isLocalTurn: true }));
    await vi.runAllTimersAsync();

    expect(session.suggestTurn).toHaveBeenCalledTimes(1);

    // Opponent's turn — should NOT trigger.
    emit('state-change', snapshot({ turn: 2, isLocalTurn: false }));
    await vi.runAllTimersAsync();

    expect(session.suggestTurn).toHaveBeenCalledTimes(1);
  });

  it('generates no proactive advice at all when autoSuggest is off', async () => {
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
      autoSuggest: false,
      debounceMs: 0,
    });
    // Mulligan, a fresh local turn, and a lethal board — each would
    // normally trigger advice; all must stay silent now.
    emit('match-started', snapshot({ turn: 0, isMulligan: true, isLocalTurn: true }));
    emit('state-change', snapshot({ turn: 0, isMulligan: true, isLocalTurn: true }));
    emit('state-change', snapshot({ turn: 1, isLocalTurn: true }));
    emit('state-change', snapshot({
      turn: 1,
      isLocalTurn: true,
      boardAttackToFace: { friendly: 6, opposing: 0 },
      opposingHero: { health: 4, armor: 2, effectiveHealth: 6 },
    }));
    await vi.runAllTimersAsync();

    expect(session.suggestMulligan).not.toHaveBeenCalled();
    expect(session.suggestTurn).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('still answers follow-up questions when autoSuggest is off', async () => {
    const { tracker, emit } = trackerHarness();
    const broadcast = vi.fn();
    const session = {
      suggestMulligan: vi.fn(async () => suggestion),
      suggestTurn: vi.fn(async () => suggestion),
      ask: vi.fn(async () => 'Face pressure wins next turn.'),
      abortInFlight: vi.fn(),
    };

    const handle = startAdvisor({
      tracker,
      broadcast,
      createSession: () => session,
      autoSuggest: false,
      debounceMs: 0,
    });
    emit('match-started', snapshot({ turn: 1 }));

    await expect(handle.ask('Why not trade?')).resolves.toBe('Face pressure wins next turn.');
    expect(session.ask).toHaveBeenCalledTimes(1);
  });

  it('records suggestions and follow-up answers for match recording persistence', async () => {
    const { tracker, emit } = trackerHarness();
    const broadcast = vi.fn();
    const session = {
      suggestMulligan: vi.fn(async () => suggestion),
      suggestTurn: vi.fn(async () => suggestion),
      ask: vi.fn(async () => 'Face pressure wins next turn.'),
      abortInFlight: vi.fn(),
    };
    let timestamp = 1_500;

    const handle = startAdvisor({
      tracker,
      broadcast,
      createSession: () => session,
      shouldSuggestTurn: (current) => current.turn === 3,
      debounceMs: 0,
      now: () => timestamp++,
    });
    emit('match-started', snapshot({ turn: 2 }));
    emit('state-change', snapshot({ turn: 3 }));
    await vi.runAllTimersAsync();
    await handle.ask('Why not trade?');

    expect(handle.getHistory()).toMatchObject([
      {
        kind: 'turn',
        turn: 3,
        createdAt: expect.any(Number),
        suggestion,
        followUps: [
          {
            question: 'Why not trade?',
            answer: 'Face pressure wins next turn.',
            createdAt: expect.any(Number),
          },
        ],
      },
    ]);
  });

  it('emits the full answer as a single chunk via emitChunk', async () => {
    const { tracker, emit } = trackerHarness();
    const broadcast = vi.fn();
    const session = {
      suggestMulligan: vi.fn(async () => suggestion),
      suggestTurn: vi.fn(async () => suggestion),
      ask: vi.fn(async () => 'Face pressure wins next turn.'),
      abortInFlight: vi.fn(),
    };

    const handle = startAdvisor({
      tracker,
      broadcast,
      createSession: () => session,
      shouldSuggestTurn: () => false,
      debounceMs: 0,
    });
    emit('match-started', snapshot({ turn: 1 }));
    const emitChunk = vi.fn();
    const answer = await handle.ask('Why not trade?', emitChunk);

    expect(answer).toBe('Face pressure wins next turn.');
    expect(emitChunk).toHaveBeenCalledWith('Face pressure wins next turn.');
  });
});
