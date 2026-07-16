import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdvisorMainState } from '../../main/advisor';
import { useAdvisor } from '../src/hooks/use-advisor';
import { useAdvisorStore } from '../src/stores/advisor-store';

function Harness() {
  useAdvisor();
  return null;
}

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
  vi.restoreAllMocks();
});

describe('useAdvisor', () => {
  it('subscribes advisor IPC state into the store and unsubscribes on unmount', () => {
    const off = vi.fn();
    let listener: ((state: AdvisorMainState) => void) | null = null;
    window.hdt.advisor.onState = vi.fn((cb) => {
      listener = cb;
      return off;
    });

    const { unmount } = render(<Harness />);
    expect(window.hdt.advisor.onState).toHaveBeenCalledTimes(1);

    const state: AdvisorMainState = {
      status: 'ready',
      suggestion: {
        actions: [{ kind: 'hold', note: 'Hold removal.' }],
        reasoning: 'Wait for a better target.',
        alerts: [],
      },
      alerts: [],
      error: null,
      updatedAt: 99,
    };
    act(() => {
      listener?.(state);
    });

    expect(useAdvisorStore.getState()).toMatchObject({
      status: 'ready',
      suggestion: state.suggestion,
      updatedAt: 99,
    });

    unmount();
    expect(off).toHaveBeenCalledTimes(1);
  });
});
