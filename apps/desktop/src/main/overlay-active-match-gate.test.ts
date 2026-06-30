import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOverlayActiveMatchGate } from './overlay-active-match-gate';

describe('createOverlayActiveMatchGate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets active=true immediately when the deck tracker enters IN_MATCH', () => {
    const setActive = vi.fn();
    const gate = createOverlayActiveMatchGate({ setActive, inactiveDebounceMs: 1500 });

    gate.setPhase('IN_MATCH');

    expect(setActive).toHaveBeenCalledTimes(1);
    expect(setActive).toHaveBeenLastCalledWith(true);
    gate.dispose();
  });

  it('delays active=false when the match signal drops', async () => {
    vi.useFakeTimers();
    const setActive = vi.fn();
    const gate = createOverlayActiveMatchGate({ setActive, inactiveDebounceMs: 1500 });

    gate.setPhase('IN_MATCH');
    setActive.mockClear();

    gate.setPhase('IDLE');
    await vi.advanceTimersByTimeAsync(1499);
    expect(setActive).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(setActive).toHaveBeenCalledTimes(1);
    expect(setActive).toHaveBeenLastCalledWith(false);
    gate.dispose();
  });

  it('cancels a pending inactive emit when IN_MATCH returns', async () => {
    vi.useFakeTimers();
    const setActive = vi.fn();
    const gate = createOverlayActiveMatchGate({ setActive, inactiveDebounceMs: 1500 });

    gate.setPhase('IN_MATCH');
    setActive.mockClear();

    gate.setPhase('IDLE');
    await vi.advanceTimersByTimeAsync(800);
    gate.setPhase('IN_MATCH');
    await vi.advanceTimersByTimeAsync(1000);

    expect(setActive).not.toHaveBeenCalled();
    gate.dispose();
  });

  it('keeps active while either phase or live power signal is active', async () => {
    vi.useFakeTimers();
    const setActive = vi.fn();
    const gate = createOverlayActiveMatchGate({ setActive, inactiveDebounceMs: 1500 });

    gate.setPhase('IN_MATCH');
    setActive.mockClear();

    gate.setLiveMatchActive(true);
    gate.setPhase('IDLE');
    await vi.advanceTimersByTimeAsync(2000);
    expect(setActive).not.toHaveBeenCalled();

    gate.setLiveMatchActive(false);
    await vi.advanceTimersByTimeAsync(1499);
    expect(setActive).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(setActive).toHaveBeenCalledTimes(1);
    expect(setActive).toHaveBeenLastCalledWith(false);
    gate.dispose();
  });

  it('dispose clears a pending inactive timer', async () => {
    vi.useFakeTimers();
    const setActive = vi.fn();
    const gate = createOverlayActiveMatchGate({ setActive, inactiveDebounceMs: 1500 });

    gate.setPhase('IN_MATCH');
    setActive.mockClear();
    gate.setPhase('IDLE');
    gate.dispose();

    await vi.advanceTimersByTimeAsync(2000);
    expect(setActive).not.toHaveBeenCalled();
  });
});
