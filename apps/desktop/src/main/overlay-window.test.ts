import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const windows: MockWindow[] = [];

  class MockWindow {
    _visible = false;
    _destroyed = false;
    _opts: Record<string, unknown>;
    webContents = { on: vi.fn() };

    constructor(opts: Record<string, unknown>) {
      this._opts = opts;
      windows.push(this);
    }
    show = vi.fn(() => { this._visible = true; });
    hide = vi.fn(() => { this._visible = false; });
    isVisible = vi.fn(() => this._visible);
    isDestroyed = vi.fn(() => this._destroyed);
    destroy = vi.fn(() => { this._destroyed = true; });
    setAlwaysOnTop = vi.fn();
    loadURL = vi.fn(() => Promise.resolve());
    loadFile = vi.fn(() => Promise.resolve());
  }

  return {
    windows,
    MockWindow,
    BrowserWindow: vi.fn((opts: Record<string, unknown>) => new MockWindow(opts)),
    setInterval: vi.spyOn(globalThis, 'setInterval'),
    screen: {
      getPrimaryDisplay: () => ({
        workAreaSize: { width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      }),
    },
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
    expect(win._opts.alwaysOnTop).toBe(true);
    expect(win._opts.skipTaskbar).toBe(true);
    expect(win._opts.focusable).toBe(false);
    expect(win._opts.show).toBe(false);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
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

  it('enable() does not start an internal poll timer (the bootstrap layer owns polling)', () => {
    const mgr = makeManager();
    const before = mocks.setInterval.mock.calls.length;
    mgr.enable();
    expect(mocks.setInterval.mock.calls.length).toBe(before);
  });

  it('enable() with gameRunning=false keeps the window hidden', () => {
    const mgr = makeManager();
    mgr.enable();
    expect(lastWindow().isVisible()).toBe(false);
  });

  it('setRunning(true) after enable() shows the window', () => {
    const mgr = makeManager();
    mgr.enable();
    mgr.setRunning(true);

    expect(lastWindow().show).toHaveBeenCalled();
    expect(lastWindow().isVisible()).toBe(true);
  });

  it('setRunning(false) after enable() hides the window', () => {
    const mgr = makeManager();
    mgr.enable();
    mgr.setRunning(true);
    expect(lastWindow().isVisible()).toBe(true);

    mgr.setRunning(false);
    expect(lastWindow().hide).toHaveBeenCalled();
    expect(lastWindow().isVisible()).toBe(false);
  });

  it('disable() hides without destroying', () => {
    const mgr = makeManager();
    mgr.enable();
    mgr.setRunning(true);
    mgr.disable();

    expect(lastWindow().isVisible()).toBe(false);
    expect(lastWindow().isDestroyed()).toBe(false);
  });

  it('disable() resets gameRunning so re-enable does not flash a stale visible window', () => {
    const mgr = makeManager();
    mgr.enable();
    mgr.setRunning(true);
    expect(lastWindow().isVisible()).toBe(true);

    mgr.disable();
    expect(lastWindow().isVisible()).toBe(false);

    mgr.enable();
    // gameRunning was reset by disable(); window stays hidden until setRunning(true) fires again
    expect(lastWindow().isVisible()).toBe(false);
  });

  it('dispose() destroys the window', () => {
    const mgr = makeManager();
    mgr.enable();
    mgr.dispose();

    expect(lastWindow().isDestroyed()).toBe(true);
  });
});
