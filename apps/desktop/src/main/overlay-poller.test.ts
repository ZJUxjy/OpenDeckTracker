import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOverlayPoller } from './overlay-poller';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createOverlayPoller', () => {
  it('does not poll until the first addClient()', async () => {
    const isAlive = vi.fn(async () => true);
    const onRunningChange = vi.fn();
    const poller = createOverlayPoller({ isAlive, onRunningChange, intervalMs: 3000 });

    await vi.advanceTimersByTimeAsync(10000);
    expect(isAlive).not.toHaveBeenCalled();
    expect(onRunningChange).not.toHaveBeenCalled();

    poller.addClient();
    await Promise.resolve();
    expect(isAlive).toHaveBeenCalled();
  });

  it('addClient() polls immediately so the first reading does not wait one interval', async () => {
    const isAlive = vi.fn(async () => true);
    const onRunningChange = vi.fn();
    const poller = createOverlayPoller({ isAlive, onRunningChange, intervalMs: 3000 });

    poller.addClient();
    await Promise.resolve();
    await Promise.resolve();
    expect(onRunningChange).toHaveBeenCalledWith(true);
  });

  it('stops polling when the last client is removed', async () => {
    const isAlive = vi.fn(async () => true);
    const onRunningChange = vi.fn();
    const poller = createOverlayPoller({ isAlive, onRunningChange, intervalMs: 3000 });

    poller.addClient();
    poller.addClient();
    await Promise.resolve();
    isAlive.mockClear();

    poller.removeClient();
    await vi.advanceTimersByTimeAsync(6000);
    // One client still active, polling continues
    expect(isAlive).toHaveBeenCalled();

    isAlive.mockClear();
    poller.removeClient();
    await vi.advanceTimersByTimeAsync(10000);
    expect(isAlive).not.toHaveBeenCalled();
  });

  it('three consecutive false readings trigger onRunningChange(false)', async () => {
    let alive = true;
    const isAlive = vi.fn(async () => alive);
    const onRunningChange = vi.fn();
    const poller = createOverlayPoller({ isAlive, onRunningChange, intervalMs: 3000 });

    poller.addClient();
    await Promise.resolve();
    await Promise.resolve();
    expect(onRunningChange).toHaveBeenLastCalledWith(true);

    alive = false;
    onRunningChange.mockClear();

    await vi.advanceTimersByTimeAsync(3000);
    expect(onRunningChange).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(onRunningChange).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(onRunningChange).toHaveBeenCalledWith(false);
  });

  it('jitter false-true never reports false', async () => {
    let alive = true;
    const isAlive = vi.fn(async () => alive);
    const onRunningChange = vi.fn();
    const poller = createOverlayPoller({ isAlive, onRunningChange, intervalMs: 3000 });

    poller.addClient();
    await Promise.resolve();
    await Promise.resolve();
    onRunningChange.mockClear();

    alive = false;
    await vi.advanceTimersByTimeAsync(3000);
    alive = true;
    await vi.advanceTimersByTimeAsync(3000);
    alive = false;
    await vi.advanceTimersByTimeAsync(3000);
    alive = true;
    await vi.advanceTimersByTimeAsync(3000);

    expect(onRunningChange).not.toHaveBeenCalledWith(false);
  });

  it('reports true only once when running stays true across many polls', async () => {
    const isAlive = vi.fn(async () => true);
    const onRunningChange = vi.fn();
    const poller = createOverlayPoller({ isAlive, onRunningChange, intervalMs: 3000 });

    poller.addClient();
    await Promise.resolve();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);

    expect(onRunningChange).toHaveBeenCalledTimes(1);
    expect(onRunningChange).toHaveBeenCalledWith(true);
  });

  it('a thrown isAlive() is treated as false', async () => {
    const isAlive = vi.fn(async () => { throw new Error('mirror down'); });
    const onRunningChange = vi.fn();
    const poller = createOverlayPoller({ isAlive, onRunningChange, intervalMs: 3000 });

    poller.addClient();
    await Promise.resolve();
    // First reading is "false" but the running state was already false (initial),
    // so no transition emitted. Confirm by triggering 3 consecutive thrown reads
    // after we briefly flip alive to seed a true reading.
    expect(onRunningChange).not.toHaveBeenCalledWith(true);

    // Three more thrown readings — still false, no further transition.
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onRunningChange).not.toHaveBeenCalledWith(true);
    expect(onRunningChange).not.toHaveBeenCalledWith(false);
  });

  it('transitions running→stopped after the throttle when isAlive starts throwing mid-game', async () => {
    let throwIt = false;
    const isAlive = vi.fn(async () => {
      if (throwIt) throw new Error('mirror down');
      return true;
    });
    const onRunningChange = vi.fn();
    const poller = createOverlayPoller({ isAlive, onRunningChange, intervalMs: 3000 });

    poller.addClient();
    await Promise.resolve();
    await Promise.resolve();
    expect(onRunningChange).toHaveBeenLastCalledWith(true);
    onRunningChange.mockClear();

    throwIt = true;
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onRunningChange).toHaveBeenCalledWith(false);
  });
});
