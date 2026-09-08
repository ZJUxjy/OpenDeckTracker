import { useSyncExternalStore } from 'react';
import type { BattleTag, MedalInfo } from '@hdt/hearthmirror';

export interface CachedPlayerIdentity {
  battleTag: BattleTag;
  lastSeenAt: number;
}

export interface HearthMirrorStatus {
  isAlive: boolean;
  battleTag: BattleTag | null;
  medalInfo: MedalInfo | null;
  cachedIdentity: CachedPlayerIdentity | null;
  /** Live `battleTag` if available, otherwise the cached one for display. */
  displayBattleTag: BattleTag | null;
  lastUpdatedAt: number;
}

const empty: HearthMirrorStatus = {
  isAlive: false, battleTag: null, medalInfo: null, cachedIdentity: null,
  displayBattleTag: null, lastUpdatedAt: 0,
};
let state = empty;
const listeners = new Set<() => void>();
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<void> | null = null;

/** One poll per renderer, regardless of how many panels subscribe. */
export function refreshHearthMirrorStatus(): Promise<void> {
  if (inFlight) return inFlight;
  clearTimeout(timer);
  const run = generation;
  const task = (async () => {
    const api = window.hdt?.hearthmirror;
    const isAlive = await api?.isAlive().catch(() => false) ?? false;
    const [battleTag, medalInfo, profile] = await Promise.all([
      isAlive ? api?.getBattleTag().catch(() => null) : null,
      isAlive ? api?.getMedalInfo().catch(() => null) : null,
      window.hdt?.playerProfile?.get?.().catch(() => null),
    ]);
    if (run !== generation) return;
    const cachedIdentity = profile
      ? { battleTag: profile.battleTag, lastSeenAt: profile.lastSeenAt }
      : state.cachedIdentity;
    state = { isAlive, battleTag: battleTag ?? null, medalInfo: medalInfo ?? null,
      cachedIdentity, displayBattleTag: battleTag ?? cachedIdentity?.battleTag ?? null,
      lastUpdatedAt: Date.now() };
    listeners.forEach(listener => listener());
  })().catch(() => {
    if (run !== generation) return;
    state = { ...state, isAlive: false, battleTag: null, medalInfo: null,
      displayBattleTag: state.cachedIdentity?.battleTag ?? null, lastUpdatedAt: Date.now() };
    listeners.forEach(listener => listener());
  }).finally(() => {
    if (run !== generation) return;
    inFlight = null;
    if (listeners.size) timer = setTimeout(() => { void refreshHearthMirrorStatus(); }, 5000);
  });
  inFlight = task;
  return task;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) void refreshHearthMirrorStatus();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      generation++;
      clearTimeout(timer);
      inFlight = null;
      state = empty;
    }
  };
}

export function useHearthMirrorStatus(): HearthMirrorStatus {
  return useSyncExternalStore(subscribe, () => state, () => empty);
}
