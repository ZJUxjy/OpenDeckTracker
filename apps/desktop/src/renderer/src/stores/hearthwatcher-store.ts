import { create } from 'zustand';
import type { HearthWatcherDiagnostic } from '@hdt/hearthwatcher';

interface HearthWatcherStoreState {
  status: HearthWatcherDiagnostic | null;
  setStatus: (status: HearthWatcherDiagnostic | null) => void;
}

export const useHearthWatcherStore = create<HearthWatcherStoreState>((set) => ({
  status: null,
  setStatus: (status) => set({ status }),
}));
