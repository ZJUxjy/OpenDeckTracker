import { create } from 'zustand';
import type { AdvisorAlert, AdvisorSuggestion } from '@hdt/advisor';
import type { AdvisorMainState } from '../../../main/advisor';

export interface AdvisorStoreState {
  status: AdvisorMainState['status'];
  suggestion: AdvisorSuggestion | null;
  alerts: AdvisorAlert[];
  error: string | null;
  updatedAt: number;
  applyState: (state: AdvisorMainState) => void;
}

function shouldPreservePreviousPayload(state: AdvisorMainState): boolean {
  return state.status === 'stale' || state.status === 'error';
}

export const useAdvisorStore = create<AdvisorStoreState>((set) => ({
  status: 'idle',
  suggestion: null,
  alerts: [],
  error: null,
  updatedAt: 0,
  applyState: (state) => {
    set((prev) => {
      if (state.status === 'idle') {
        return {
          status: 'idle',
          suggestion: null,
          alerts: [],
          error: state.error,
          updatedAt: state.updatedAt,
        };
      }

      const preserve = shouldPreservePreviousPayload(state);
      return {
        status: state.status,
        suggestion: preserve && state.suggestion === null ? prev.suggestion : state.suggestion,
        alerts: preserve && state.alerts.length === 0 ? prev.alerts : state.alerts,
        error: state.error,
        updatedAt: state.updatedAt,
      };
    });
  },
}));
