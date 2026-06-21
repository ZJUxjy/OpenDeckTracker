import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const windows: MockWindow[] = [];

  class MockWindow {
    _visible = false;
    _destroyed = false;
    _opts: Record<string, unknown>;
    _currentBounds: { x: number; y: number; width: number; height: number };
    _listeners: Record<string, Array<() => void>> = {};
    _nativeHandle = new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]);
    webContents = { on: vi.fn() };

    constructor(opts: Record<string, unknown>) {
      this._opts = opts;
      this._currentBounds = {
        x: (opts['x'] as number) ?? 0,
        y: (opts['y'] as number) ?? 0,
        width: (opts['width'] as number) ?? 0,
        height: (opts['height'] as number) ?? 0,
      };
      windows.push(this);
    }
    show = vi.fn(() => { this._visible = true; });
    showInactive = vi.fn(() => { this._visible = true; });
    hide = vi.fn(() => { this._visible = false; });
    isVisible = vi.fn(() => this._visible);
    isDestroyed = vi.fn(() => this._destroyed);
    destroy = vi.fn(() => { this._destroyed = true; });
    setAlwaysOnTop = vi.fn();
    moveTop = vi.fn();
    getNativeWindowHandle = vi.fn(() => this._nativeHandle);
    loadURL = vi.fn(() => Promise.resolve());
    loadFile = vi.fn(() => Promise.resolve());
    setBounds = vi.fn((rect: { x: number; y: number; width: number; height: number }) => {
      this._currentBounds = { ...rect };
    });
    getBounds = vi.fn(() => ({ ...this._currentBounds }));
    setVisibleOnAllWorkspaces = vi.fn();
    on = vi.fn((event: string, handler: () => void) => {
      (this._listeners[event] ??= []).push(handler);
      return this;
    });
    /** Test helper — fire a registered event handler synchronously. */
    _emit(event: string): void {
      const handlers = this._listeners[event];
      if (!handlers) return;
      for (const h of handlers) h();
    }
  }

  // Default screen mock with a 1920×1080 work-area; individual
  // tests can override `getDisplayMatching` via the `screen` export.
  const screen = {
    getDisplayMatching: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
  };

  return {
    windows,
    MockWindow,
    BrowserWindow: vi.fn((opts: Record<string, unknown>) => new MockWindow(opts)),
    screen,
    setInterval: vi.spyOn(globalThis, 'setInterval'),
  };
});

vi.mock('electron', () => ({
  BrowserWindow: mocks.BrowserWindow,
  screen: mocks.screen,
}));

import { OverlayManager, type OverlayManagerOptions } from './overlay-window';

function makeManager(extra: Partial<OverlayManagerOptions> = {}) {
  return new OverlayManager({
    rendererUrl: '/fake/renderer/index.html',
    preloadPath: '/fake/preload.js',
    // Default to win32 so existing tests exercise the non-darwin (no
    // foreground-gate) path.  Darwin-specific tests pass platform explicitly.
    platform: 'win32',
    ...extra,
  });
}

function lastWindow() {
  return mocks.windows[mocks.windows.length - 1]!;
}

beforeEach(() => {
  mocks.windows.length = 0;
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('OverlayManager', () => {
  it('does not create a window at construction time', () => {
    makeManager();
    expect(mocks.windows).toHaveLength(0);
  });

  it('enable() creates a window with prescribed options', () => {
    const mgr = makeManager();
    mgr.enable();

    expect(mocks.windows).toHaveLength(1);
    const win = lastWindow();
    expect(win._opts.transparent).toBe(true);
    expect(win._opts.frame).toBe(false);
    expect(win._opts.alwaysOnTop).toBe(false);
    expect(win._opts.skipTaskbar).toBe(true);
    // focusable=true since v2 (drag region requires it on Windows).
    expect(win._opts.focusable).toBe(true);
    expect(win._opts.show).toBe(false);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(false);
  });

  it('initial bounds are 1×1 at origin (no static workArea sizing)', () => {
    const mgr = makeManager();
    mgr.enable();
    const win = lastWindow();
    expect(win._opts.x).toBe(0);
    expect(win._opts.y).toBe(0);
    expect(win._opts.width).toBe(1);
    expect(win._opts.height).toBe(1);
  });

  it('enable() loads URL with default #/overlay hash', () => {
    const mgr = makeManager();
    mgr.enable();

    const win = lastWindow();
    if ((win.loadURL.mock.calls as string[][]).length > 0) {
      expect((win.loadURL.mock.calls as string[][])[0]![0]).toContain('#/overlay');
    } else {
      expect((win.loadFile.mock.calls as unknown[][])[0]![1]).toEqual({ hash: '/overlay' });
    }
  });

  it('honors a routeHash option (#/overlay-opponent)', () => {
    const mgr = makeManager({ routeHash: '/overlay-opponent' });
    mgr.enable();

    const win = lastWindow();
    if ((win.loadURL.mock.calls as string[][]).length > 0) {
      expect((win.loadURL.mock.calls as string[][])[0]![0]).toContain('#/overlay-opponent');
    } else {
      expect((win.loadFile.mock.calls as unknown[][])[0]![1]).toEqual({ hash: '/overlay-opponent' });
    }
  });

  it('enable() does not start an internal poll timer', () => {
    const mgr = makeManager();
    const before = mocks.setInterval.mock.calls.length;
    mgr.enable();
    expect(mocks.setInterval.mock.calls.length).toBe(before);
  });

  it('enable() with visibleOnScreen=false keeps the window hidden', () => {
    const mgr = makeManager();
    mgr.enable();
    expect(lastWindow().isVisible()).toBe(false);
  });

  it('setVisibleOnScreen(true) + setInActiveMatch(true) after enable() shows above Hearthstone even in background', () => {
    const placeWindowAboveHearthstone = vi.fn(() => true);
    const mgr = makeManager({ placeWindowAboveHearthstone });
    mgr.enable();
    mgr.setInActiveMatch(true);
    mgr.setVisibleOnScreen(true);

    const win = lastWindow();
    expect(win.showInactive).toHaveBeenCalled();
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(placeWindowAboveHearthstone).toHaveBeenCalledWith(win._nativeHandle);
    expect(win.isVisible()).toBe(true);
  });

  it('setTargetForeground(true) switches the visible overlay to screen-saver topmost', () => {
    const mgr = makeManager();
    mgr.enable();
    mgr.setInActiveMatch(true);
    mgr.setVisibleOnScreen(true);
    const win = lastWindow();
    win.setAlwaysOnTop.mockClear();

    mgr.setTargetForeground(true);

    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
    expect(win.moveTop).toHaveBeenCalled();
    expect(win.isVisible()).toBe(true);
  });

  it('reasserts z-order shortly after Hearthstone returns to foreground', async () => {
    vi.useFakeTimers();
    const mgr = makeManager();
    mgr.enable();
    mgr.setInActiveMatch(true);
    mgr.setVisibleOnScreen(true);
    const win = lastWindow();
    win.setAlwaysOnTop.mockClear();
    win.moveTop.mockClear();

    mgr.setTargetForeground(true);

    expect(win.setAlwaysOnTop).toHaveBeenCalledTimes(1);
    expect(win.moveTop).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(50);
    expect(win.setAlwaysOnTop).toHaveBeenCalledTimes(2);
    expect(win.moveTop).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(200);
    expect(win.setAlwaysOnTop).toHaveBeenCalledTimes(3);
    expect(win.moveTop).toHaveBeenCalledTimes(3);
  });

  it('setVisibleOnScreen(false) after showing hides the window', () => {
    const mgr = makeManager();
    mgr.enable();
    mgr.setInActiveMatch(true);
    mgr.setVisibleOnScreen(true);
    mgr.setTargetForeground(true);
    expect(lastWindow().isVisible()).toBe(true);

    mgr.setVisibleOnScreen(false);
    expect(lastWindow().hide).toHaveBeenCalled();
    expect(lastWindow().isVisible()).toBe(false);
  });

  it('setInActiveMatch(false) hides the window even if visibleOnScreen is true', () => {
    const mgr = makeManager();
    mgr.enable();
    mgr.setInActiveMatch(true);
    mgr.setVisibleOnScreen(true);
    mgr.setTargetForeground(true);
    expect(lastWindow().isVisible()).toBe(true);

    mgr.setInActiveMatch(false);
    expect(lastWindow().isVisible()).toBe(false);
  });

  it('disable() hides without destroying', () => {
    const mgr = makeManager();
    mgr.enable();
    mgr.setInActiveMatch(true);
    mgr.setVisibleOnScreen(true);
    mgr.setTargetForeground(true);
    mgr.disable();

    expect(lastWindow().isVisible()).toBe(false);
    expect(lastWindow().isDestroyed()).toBe(false);
  });

  it('disable() resets visibleOnScreen so re-enable does not flash a stale visible window', () => {
    const mgr = makeManager();
    mgr.enable();
    mgr.setInActiveMatch(true);
    mgr.setVisibleOnScreen(true);
    mgr.setTargetForeground(true);
    expect(lastWindow().isVisible()).toBe(true);

    mgr.disable();
    expect(lastWindow().isVisible()).toBe(false);

    mgr.enable();
    expect(lastWindow().isVisible()).toBe(false);
  });

  it('setTargetForeground(false) keeps the window visible and places it above Hearthstone', () => {
    const placeWindowAboveHearthstone = vi.fn(() => true);
    const mgr = makeManager({ placeWindowAboveHearthstone });
    mgr.enable();
    mgr.setInActiveMatch(true);
    mgr.setVisibleOnScreen(true);
    mgr.setTargetForeground(true);
    const win = lastWindow();
    expect(win.isVisible()).toBe(true);
    win.hide.mockClear();

    mgr.setTargetForeground(false);

    expect(win.hide).not.toHaveBeenCalled();
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(placeWindowAboveHearthstone).toHaveBeenCalledWith(win._nativeHandle);
    expect(win.isVisible()).toBe(true);
  });

  it('tracks overlay focus and notifies the host', () => {
    const onFocusChange = vi.fn();
    const mgr = makeManager({ onFocusChange });
    mgr.enable();
    const win = lastWindow();

    win._emit('focus');
    expect(mgr.isWindowFocused()).toBe(true);
    expect(onFocusChange).toHaveBeenCalledTimes(1);

    win._emit('blur');
    expect(mgr.isWindowFocused()).toBe(false);
    expect(onFocusChange).toHaveBeenCalledTimes(2);
  });

  it('dispose() destroys the window', () => {
    const mgr = makeManager();
    mgr.enable();
    mgr.dispose();

    expect(lastWindow().isDestroyed()).toBe(true);
  });

  it('setBounds() before enable() is remembered and applied at create time', () => {
    const mgr = makeManager();
    mgr.setBounds({ x: 100, y: 200, width: 1280, height: 720 });
    mgr.enable();
    const win = lastWindow();
    expect(win.setBounds).toHaveBeenCalledWith({ x: 100, y: 200, width: 1280, height: 720 });
    expect(win._currentBounds).toEqual({ x: 100, y: 200, width: 1280, height: 720 });
  });

  it('setBounds() after enable() calls BrowserWindow.setBounds', () => {
    const mgr = makeManager();
    mgr.enable();
    const win = lastWindow();
    win.setBounds.mockClear();

    mgr.setBounds({ x: 50, y: 50, width: 1280, height: 720 });
    expect(win.setBounds).toHaveBeenCalledTimes(1);
    expect(win.setBounds).toHaveBeenCalledWith({ x: 50, y: 50, width: 1280, height: 720 });
  });

  it('setBounds() with the same rect twice in a row is suppressed', () => {
    const mgr = makeManager();
    mgr.enable();
    const win = lastWindow();
    win.setBounds.mockClear();

    const rect = { x: 50, y: 50, width: 1280, height: 720 };
    mgr.setBounds(rect);
    mgr.setBounds(rect);
    mgr.setBounds(rect);
    expect(win.setBounds).toHaveBeenCalledTimes(1);
  });

  it('setBounds() with a different rect after a prior call does fire', () => {
    const mgr = makeManager();
    mgr.enable();
    const win = lastWindow();
    win.setBounds.mockClear();

    mgr.setBounds({ x: 0, y: 0, width: 1920, height: 1080 });
    mgr.setBounds({ x: 100, y: 100, width: 1280, height: 720 });
    expect(win.setBounds).toHaveBeenCalledTimes(2);
  });

  it('user-initiated moved event updates userOffset', () => {
    const mgr = makeManager();
    mgr.enable();
    const win = lastWindow();

    // Tracker emits its first bounds; flag clears on the next microtask.
    mgr.setBounds({ x: 100, y: 50, width: 320, height: 800 });
    return Promise.resolve().then(() => {
      // User drags the window — simulate the new bounds and fire `moved`.
      win._currentBounds = { x: 140, y: 70, width: 320, height: 800 };
      win._emit('moved');

      expect((mgr as unknown as { userOffset: { dx: number; dy: number } }).userOffset).toEqual({
        dx: 40,
        dy: 20,
      });
    });
  });

  it('setBounds composes userOffset onto tracker bounds', () => {
    const mgr = makeManager();
    mgr.enable();
    const win = lastWindow();
    win.setBounds.mockClear();

    (mgr as unknown as { userOffset: { dx: number; dy: number } }).userOffset = { dx: 40, dy: 20 };
    mgr.setBounds({ x: 100, y: 50, width: 320, height: 800 });

    expect(win.setBounds).toHaveBeenCalledWith({ x: 140, y: 70, width: 320, height: 800 });
  });

  it('composed bounds clamp to display work-area', () => {
    const mgr = makeManager();
    mgr.enable();
    const win = lastWindow();
    win.setBounds.mockClear();

    // Force the workArea so the test is deterministic regardless of host display.
    mocks.screen.getDisplayMatching.mockReturnValueOnce({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    });
    (mgr as unknown as { userOffset: { dx: number; dy: number } }).userOffset = { dx: 100000, dy: 0 };
    mgr.setBounds({ x: 100, y: 50, width: 320, height: 800 });

    const applied = win.setBounds.mock.calls[0]![0] as { x: number; width: number };
    expect(applied.x + applied.width).toBeLessThanOrEqual(1920);
  });

  it('programmatic setBounds does not update userOffset (echo recognised by bounds equality)', () => {
    const mgr = makeManager();
    mgr.enable();
    const win = lastWindow();

    // No user offset yet. Tracker emits — `moved` event fires from the
    // BrowserWindow.setBounds mock side-effect. The handler recognises our
    // own echo because the window bounds equal lastAppliedBounds.
    mgr.setBounds({ x: 200, y: 50, width: 320, height: 800 });
    win._currentBounds = { x: 200, y: 50, width: 320, height: 800 };
    win._emit('moved');

    expect((mgr as unknown as { userOffset: { dx: number; dy: number } }).userOffset).toEqual({
      dx: 0,
      dy: 0,
    });
  });

  it('setBounds echo on a later macrotask does not update userOffset', async () => {
    const mgr = makeManager();
    mgr.enable();
    const win = lastWindow();

    // Tracker applies bounds, then the OS emits `moved` on a later event-
    // loop turn (a real macrotask, not a microtask). The previous microtask-
    // based flag would already have cleared by this point and misclassified
    // the echo as a user drag; the bounds-equality check suppresses it
    // regardless of timing.
    mgr.setBounds({ x: 200, y: 50, width: 320, height: 800 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    win._currentBounds = { x: 200, y: 50, width: 320, height: 800 };
    win._emit('moved');

    expect((mgr as unknown as { userOffset: { dx: number; dy: number } }).userOffset).toEqual({
      dx: 0,
      dy: 0,
    });
  });

  it('successive drags compose against lastTrackerBounds (not previous offset)', () => {
    const mgr = makeManager();
    mgr.enable();
    const win = lastWindow();

    // First tracker tick + user drag → offset { dx: 40, dy: 20 }.
    mgr.setBounds({ x: 100, y: 50, width: 320, height: 800 });
    return Promise.resolve()
      .then(() => {
        win._currentBounds = { x: 140, y: 70, width: 320, height: 800 };
        win._emit('moved');
        expect(
          (mgr as unknown as { userOffset: { dx: number; dy: number } }).userOffset,
        ).toEqual({ dx: 40, dy: 20 });

        // Second tracker tick at same x,y — nothing recomposed yet.
        mgr.setBounds({ x: 100, y: 50, width: 320, height: 800 });
        return Promise.resolve();
      })
      .then(() => {
        // User drags again to (110, 45) — offset is recomputed from
        // current vs lastTrackerBounds, NOT added to previous offset.
        win._currentBounds = { x: 110, y: 45, width: 320, height: 800 };
        win._emit('moved');
        expect(
          (mgr as unknown as { userOffset: { dx: number; dy: number } }).userOffset,
        ).toEqual({ dx: 10, dy: -5 });
      });
  });
});

describe('OverlayManager darwin foreground gate', () => {
  it('on darwin stays hidden until Hearthstone is frontmost', () => {
    const mgr = new OverlayManager({
      rendererUrl: 'r',
      preloadPath: 'p',
      platform: 'darwin',
    });
    mgr.enable();
    mgr.setVisibleOnScreen(true);
    mgr.setInActiveMatch(true);
    // foreground still false → must be hidden
    const win = mocks.windows.at(-1)!;
    expect(win.isVisible()).toBe(false);

    mgr.setTargetForeground(true);
    expect(win.isVisible()).toBe(true);

    mgr.setTargetForeground(false);
    expect(win.isVisible()).toBe(false);
  });

  it('on win32 ignores foreground for visibility', () => {
    const mgr = new OverlayManager({
      rendererUrl: 'r',
      preloadPath: 'p',
      platform: 'win32',
    });
    mgr.enable();
    mgr.setVisibleOnScreen(true);
    mgr.setInActiveMatch(true);
    const win = mocks.windows.at(-1)!;
    expect(win.isVisible()).toBe(true); // shown without foreground
  });
});
