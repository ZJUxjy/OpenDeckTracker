import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PollingLoop } from './polling-loop';

describe('PollingLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls fn on schedule at the requested interval', async () => {
    const loop = new PollingLoop();
    const fn = vi.fn();
    loop.start(100, fn);
    // First call fires after a 0ms setTimeout
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(3);
    loop.stop();
  });

  it('requestImmediate fires the next tick within ~0ms', async () => {
    const loop = new PollingLoop();
    const fn = vi.fn();
    loop.start(1000, fn);
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
    loop.requestImmediate();
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(2);
    loop.stop();
  });

  it('stop ends the recursion (no more calls)', async () => {
    const loop = new PollingLoop();
    const fn = vi.fn();
    loop.start(100, fn);
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
    loop.stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('errors thrown by fn route to onError, loop keeps running', async () => {
    const loop = new PollingLoop();
    const onError = vi.fn();
    let calls = 0;
    const fn = (): void => {
      calls++;
      if (calls === 1) throw new Error('boom');
    };
    loop.start(50, fn, onError);
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(50);
    expect(calls).toBe(2);
    loop.stop();
  });

  it('setInterval changes pace AFTER current scheduled timer fires (not retroactively)', async () => {
    const loop = new PollingLoop();
    const fn = vi.fn();
    loop.start(1000, fn);
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
    // Setting a shorter interval here doesn't pre-empt the already-scheduled 1000ms timer.
    loop.setInterval(50);
    await vi.advanceTimersByTimeAsync(50);
    expect(fn).toHaveBeenCalledTimes(1); // still waiting on the old 1000ms timer
    // After the original 1000ms expires + fn runs, the NEXT timer uses 50ms.
    await vi.advanceTimersByTimeAsync(950);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(50);
    expect(fn).toHaveBeenCalledTimes(3);
    loop.stop();
  });

  it('requestImmediate is the way to apply a faster interval mid-cycle', async () => {
    const loop = new PollingLoop();
    const fn = vi.fn();
    loop.start(1000, fn);
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
    loop.setInterval(50);
    loop.requestImmediate();
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(50);
    expect(fn).toHaveBeenCalledTimes(3);
    loop.stop();
  });
});
