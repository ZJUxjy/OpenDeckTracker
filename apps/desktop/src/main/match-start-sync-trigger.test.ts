import { describe, expect, it, vi } from 'vitest';
import type { MatchPhase } from '@hdt/core';
import { createMatchStartSyncTrigger } from './match-start-sync-trigger';

type PhaseListener = (phase: MatchPhase) => void;

function makeOnPhase(): {
  onPhase: (cb: PhaseListener) => () => void;
  emit: (phase: MatchPhase) => void;
  subscriberCount: () => number;
} {
  const listeners = new Set<PhaseListener>();
  return {
    onPhase: (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    emit: (phase) => {
      for (const cb of listeners) cb(phase);
    },
    subscriberCount: () => listeners.size,
  };
}

describe('createMatchStartSyncTrigger', () => {
  it('triggers sync on IDLE -> PRE_MATCH', async () => {
    const { onPhase, emit } = makeOnPhase();
    const syncFromLive = vi.fn(() => Promise.resolve({ ok: true } as never));
    const now = vi.fn(() => 1000);

    createMatchStartSyncTrigger({ onPhase, syncFromLive, now });
    emit('IDLE');
    emit('PRE_MATCH');

    expect(syncFromLive).toHaveBeenCalledTimes(1);
  });

  it('does not re-trigger within debounce window', () => {
    const { onPhase, emit } = makeOnPhase();
    const syncFromLive = vi.fn(() => Promise.resolve({ ok: true } as never));
    let t = 1000;
    const now = vi.fn(() => t);

    createMatchStartSyncTrigger({ onPhase, syncFromLive, now, minIntervalMs: 5000 });
    emit('IDLE');
    emit('PRE_MATCH');
    expect(syncFromLive).toHaveBeenCalledTimes(1);

    t = 3000; // 2s later — inside debounce window
    emit('IDLE');
    emit('PRE_MATCH');
    expect(syncFromLive).toHaveBeenCalledTimes(1);
  });

  it('re-triggers after debounce window elapses', () => {
    const { onPhase, emit } = makeOnPhase();
    const syncFromLive = vi.fn(() => Promise.resolve({ ok: true } as never));
    let t = 1000;
    const now = vi.fn(() => t);

    createMatchStartSyncTrigger({ onPhase, syncFromLive, now, minIntervalMs: 5000 });
    emit('IDLE');
    emit('PRE_MATCH');
    expect(syncFromLive).toHaveBeenCalledTimes(1);

    t = 7000; // 6s later — outside debounce window
    emit('IDLE');
    emit('PRE_MATCH');
    expect(syncFromLive).toHaveBeenCalledTimes(2);
  });

  it('ignores PRE_MATCH following non-IDLE phases', () => {
    const { onPhase, emit } = makeOnPhase();
    const syncFromLive = vi.fn(() => Promise.resolve({ ok: true } as never));
    const now = vi.fn(() => 1000);

    createMatchStartSyncTrigger({ onPhase, syncFromLive, now });
    emit('IN_MATCH');
    emit('PRE_MATCH');

    expect(syncFromLive).not.toHaveBeenCalled();
  });
});
