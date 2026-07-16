import { afterEach, describe, expect, it } from 'vitest';
import type { AdvisorMainState } from '../../main/advisor';
import { useAdvisorStore } from '../src/stores/advisor-store';

const readyState: AdvisorMainState = {
  status: 'ready',
  suggestion: {
    actions: [{ kind: 'play', cardId: 'CS2_029', note: 'Play Fireball face.' }],
    reasoning: 'Set up lethal.',
    alerts: [{ type: 'lethal', detail: 'Lethal this turn.' }],
  },
  alerts: [{ type: 'lethal', detail: 'Lethal this turn.' }],
  error: null,
  updatedAt: 100,
};

function resetAdvisorStore(): void {
  useAdvisorStore.setState({
    status: 'idle',
    suggestion: null,
    alerts: [],
    error: null,
    updatedAt: 0,
  });
}

afterEach(() => {
  resetAdvisorStore();
});

describe('advisor store', () => {
  it('starts idle', () => {
    expect(useAdvisorStore.getState()).toMatchObject({
      status: 'idle',
      suggestion: null,
      alerts: [],
      error: null,
      updatedAt: 0,
    });
  });

  it('applies ready state with suggestion and alerts', () => {
    useAdvisorStore.getState().applyState(readyState);

    expect(useAdvisorStore.getState()).toMatchObject({
      status: 'ready',
      suggestion: readyState.suggestion,
      alerts: readyState.alerts,
      error: null,
      updatedAt: 100,
    });
  });

  it('keeps the last suggestion and alerts when stale arrives empty', () => {
    useAdvisorStore.getState().applyState(readyState);
    useAdvisorStore.getState().applyState({
      status: 'stale',
      suggestion: null,
      alerts: [],
      error: null,
      updatedAt: 120,
    });

    expect(useAdvisorStore.getState()).toMatchObject({
      status: 'stale',
      suggestion: readyState.suggestion,
      alerts: readyState.alerts,
      error: null,
      updatedAt: 120,
    });
  });

  it('keeps alerts on errors but records the error message', () => {
    useAdvisorStore.getState().applyState(readyState);
    useAdvisorStore.getState().applyState({
      status: 'error',
      suggestion: null,
      alerts: [],
      error: 'provider failed',
      updatedAt: 130,
    });

    expect(useAdvisorStore.getState()).toMatchObject({
      status: 'error',
      suggestion: readyState.suggestion,
      alerts: readyState.alerts,
      error: 'provider failed',
      updatedAt: 130,
    });
  });

  it('clears a previous lethal alert when a ready state has no alerts', () => {
    useAdvisorStore.getState().applyState(readyState);
    useAdvisorStore.getState().applyState({
      status: 'ready',
      suggestion: { actions: [], reasoning: 'No immediate lethal.', alerts: [] },
      alerts: [],
      error: null,
      updatedAt: 140,
    });

    expect(useAdvisorStore.getState().alerts).toEqual([]);
  });

  it('clears suggestion and alerts when the advisor returns idle', () => {
    useAdvisorStore.getState().applyState(readyState);
    useAdvisorStore.getState().applyState({
      status: 'idle',
      suggestion: null,
      alerts: [],
      error: null,
      updatedAt: 200,
    });

    expect(useAdvisorStore.getState()).toMatchObject({
      status: 'idle',
      suggestion: null,
      alerts: [],
      error: null,
      updatedAt: 200,
    });
  });
});
