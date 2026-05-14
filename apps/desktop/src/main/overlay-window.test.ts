import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const windows: MockWindow[] = [];

  class MockWindow {
    _visible = false;
    _destroyed = false;
    _opts: Record<string, unknown>;
    _currentBounds: { x: number; y: number; width: number; height: number };
    _listeners: Record<string, Array<() => void>> = {};
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
    loadURL = vi.fn(() => Promise.resolve());
    loadFile = vi.fn(() => Promise.resolve());
    setBounds = vi.fn((rect: { x: number; y: number; width: number; height: number }) => {
      this._currentBounds = { ...rect };
    });
    getBounds = vi.fn(() => ({ ...this._currentBounds }));
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

  it('setVisibleOnScreen(true) + setInActiveMatch(true) + setTargetForeground(true) after enable() shows the window', () => {
    const mgr = makeManager();
    mgr.enable();
    mgr.setInActiveMatch(true);
    mgr.setVisibleOnScreen(true);
    mgr.setTargetForeground(true);

    expect(lastWindow().setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
    expect(lastWindow().showInactive).toHaveBeenCalled();
    expect(lastWindow().isVisible()).toBe(true);
  });

  it('keeps the window hidden while Hearthstone is not foreground', () => {
    const mgr = makeManager();
    mgr.enable();
    mgr.setInActiveMatch(true);
    mgr.setVisibleOnScreen(true);

    expect(lastWindow().isVisible()).toBe(false);
    expect(lastWindow().showInactive).not.toHaveBeenCalled();
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

  it('setTargetForeground(false) hides the window without disabling the overlay', () => {
    const mgr = makeManager();
    mgr.enable();
    mgr.setInActiveMatch(true);
    mgr.setVisibleOnScreen(true);
    mgr.setTargetForeground(true);
    expect(lastWindow().isVisible()).toBe(true);

    mgr.setTargetForeground(false);

    expect(lastWindow().hide).toHaveBeenCalled();
    expect(lastWindow().setAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(lastWindow().isVisible()).toBe(false);
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

  it('programmatic setBounds does not update userOffset (flag suppresses)', () => {
    const mgr = makeManager();
    mgr.enable();
    const win = lastWindow();

    // No user offset yet. Tracker emits — `moved` event fires from the
    // BrowserWindow.setBounds mock side-effect (we simulate by emitting
    // while the flag is still set, before the microtask clears it).
    mgr.setBounds({ x: 200, y: 50, width: 320, height: 800 });
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
