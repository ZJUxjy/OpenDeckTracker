import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HearthstoneWindow } from '@hdt/hearthmirror';
import {
  createHearthstoneWindowTracker,
  type TrackerEvent,
} from './hearthstone-window-tracker';

const HS_VISIBLE: HearthstoneWindow = {
  x: 0, y: 0, width: 1920, height: 1080, minimized: false, visible: true, foreground: true,
};

const HS_MOVED: HearthstoneWindow = {
  x: 100, y: 100, width: 1920, height: 1080, minimized: false, visible: true, foreground: true,
};

const HS_MINIMIZED: HearthstoneWindow = {
  x: 0, y: 0, width: 1920, height: 1080, minimized: true, visible: true, foreground: false,
};

const HS_BACKGROUND: HearthstoneWindow = {
  x: 0, y: 0, width: 1920, height: 1080, minimized: false, visible: true, foreground: false,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function collect(): { events: TrackerEvent[]; cb: (e: TrackerEvent) => void } {
  const events: TrackerEvent[] = [];
  return { events, cb: (e) => events.push(e) };
}

describe('createHearthstoneWindowTracker', () => {
  it('does not poll before first addClient', async () => {
    const getWindow = vi.fn(async () => HS_VISIBLE);
    const tracker = createHearthstoneWindowTracker({ getWindow });

    await vi.advanceTimersByTimeAsync(1000);
    expect(getWindow).not.toHaveBeenCalled();
    tracker.stop();
  });

  it('starts polling on first addClient with an immediate first poll', async () => {
    const getWindow = vi.fn(async () => HS_VISIBLE);
    const tracker = createHearthstoneWindowTracker({ getWindow });
    const { cb } = collect();
    tracker.subscribe(cb);

    tracker.addClient();
    await Promise.resolve();
    await Promise.resolve();
    expect(getWindow).toHaveBeenCalled();
    tracker.stop();
  });

  it('stops polling when last client is removed', async () => {
    const getWindow = vi.fn(async () => HS_VISIBLE);
    const tracker = createHearthstoneWindowTracker({ getWindow });
    tracker.addClient();
    tracker.addClient();
    await Promise.resolve();

    tracker.removeClient();
    await vi.advanceTimersByTimeAsync(400);
    const callsAfterFirstRemove = getWindow.mock.calls.length;

    tracker.removeClient();
    await vi.advanceTimersByTimeAsync(400);
    expect(getWindow.mock.calls.length).toBe(callsAfterFirstRemove);
    tracker.stop();
  });

  it('emits bounds-then-visibility on first appearance', async () => {
    const getWindow = vi.fn(async () => HS_VISIBLE);
    const tracker = createHearthstoneWindowTracker({ getWindow });
    const { events, cb } = collect();
    tracker.subscribe(cb);

    tracker.addClient();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(events.length).toBe(3);
    expect(events[0]?.kind).toBe('bounds');
    expect(events[1]?.kind).toBe('visibility');
    expect(events[2]?.kind).toBe('foreground');
    if (events[1]?.kind === 'visibility') expect(events[1].visible).toBe(true);
    if (events[2]?.kind === 'foreground') expect(events[2].foreground).toBe(true);
    tracker.stop();
  });

  it('does not re-emit bounds when they are unchanged', async () => {
    const getWindow = vi.fn(async () => HS_VISIBLE);
    const tracker = createHearthstoneWindowTracker({ getWindow });
    const { events, cb } = collect();
    tracker.subscribe(cb);

    tracker.addClient();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const baseline = events.length;

    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(200);

    expect(events.length).toBe(baseline);
    tracker.stop();
  });

  it('emits a fresh bounds event when the window moves', async () => {
    let result: HearthstoneWindow = HS_VISIBLE;
    const getWindow = vi.fn(async () => result);
    const tracker = createHearthstoneWindowTracker({ getWindow });
    const { events, cb } = collect();
    tracker.subscribe(cb);

    tracker.addClient();
    await Promise.resolve();
    await Promise.resolve();
    events.length = 0;

    result = HS_MOVED;
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(0);

    const bounds = events.find((e) => e.kind === 'bounds');
    expect(bounds).toBeDefined();
    if (bounds?.kind === 'bounds') expect(bounds.bounds.x).toBe(100);
    tracker.stop();
  });

  it('null result maps to visibility=false (after throttle)', async () => {
    let result: HearthstoneWindow | null = HS_VISIBLE;
    const getWindow = vi.fn(async () => result);
    const tracker = createHearthstoneWindowTracker({ getWindow });
    const { events, cb } = collect();
    tracker.subscribe(cb);

    tracker.addClient();
    await Promise.resolve();
    await Promise.resolve();
    events.length = 0;

    result = null;
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(0);
    }

    const last = events[events.length - 1];
    expect(last?.kind).toBe('visibility');
    if (last?.kind === 'visibility') expect(last.visible).toBe(false);
    tracker.stop();
  });

  it('minimized=true maps to visibility=false (after throttle)', async () => {
    let result: HearthstoneWindow = HS_VISIBLE;
    const getWindow = vi.fn(async () => result);
    const tracker = createHearthstoneWindowTracker({ getWindow });
    const { events, cb } = collect();
    tracker.subscribe(cb);

    tracker.addClient();
    await Promise.resolve();
    await Promise.resolve();
    events.length = 0;

    result = HS_MINIMIZED;
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(0);
    }

    const last = events[events.length - 1];
    expect(last?.kind).toBe('visibility');
    if (last?.kind === 'visibility') expect(last.visible).toBe(false);
    tracker.stop();
  });

  it('brief jitter (4 false then 1 true) does NOT emit visibility=false', async () => {
    let result: HearthstoneWindow | null = HS_VISIBLE;
    const getWindow = vi.fn(async () => result);
    const tracker = createHearthstoneWindowTracker({ getWindow });
    const { events, cb } = collect();
    tracker.subscribe(cb);

    tracker.addClient();
    await Promise.resolve();
    await Promise.resolve();
    events.length = 0;

    result = null;
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(0);
    }
    result = HS_VISIBLE;
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(0);

    const visEvent = events.find((e) => e.kind === 'visibility');
    expect(visEvent).toBeUndefined();
    tracker.stop();
  });

  it('emits foreground=false immediately when Hearthstone moves behind another app', async () => {
    let result: HearthstoneWindow = HS_VISIBLE;
    const getWindow = vi.fn(async () => result);
    const tracker = createHearthstoneWindowTracker({ getWindow });
    const { events, cb } = collect();
    tracker.subscribe(cb);

    tracker.addClient();
    await Promise.resolve();
    await Promise.resolve();
    events.length = 0;

    result = HS_BACKGROUND;
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(0);

    expect(events).toContainEqual({ kind: 'foreground', foreground: false });
    expect(events.find((event) => event.kind === 'visibility')).toBeUndefined();
    tracker.stop();
  });

  it('emits foreground=true when Hearthstone returns to the foreground', async () => {
    let result: HearthstoneWindow = HS_BACKGROUND;
    const getWindow = vi.fn(async () => result);
    const tracker = createHearthstoneWindowTracker({ getWindow });
    const { events, cb } = collect();
    tracker.subscribe(cb);

    tracker.addClient();
    await Promise.resolve();
    await Promise.resolve();
    events.length = 0;

    result = HS_VISIBLE;
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(0);

    expect(events).toContainEqual({ kind: 'foreground', foreground: true });
    tracker.stop();
  });

  it('thrown getWindow is treated as null', async () => {
    const getWindow = vi.fn(async () => {
      throw new Error('mirror down');
    });
    const tracker = createHearthstoneWindowTracker({ getWindow });
    const { events, cb } = collect();
    tracker.subscribe(cb);

    tracker.addClient();
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(0);
    }

    // First reading is null but lastVisible was already false, so no transition;
    // subsequent thrown reads stay null. Confirm we never falsely report true.
    const reportedTrue = events.some((e) => e.kind === 'visibility' && e.visible);
    expect(reportedTrue).toBe(false);
    tracker.stop();
  });
});
