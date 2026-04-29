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

import { OverlayManager } from './overlay-window';

function makeManager(isAlive: () => Promise<boolean> = async () => false) {
  return new OverlayManager({
    rendererUrl: '/fake/renderer/index.html',
    preloadPath: '/fake/preload.js',
    isAlive,
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
    const mgr = makeManager(async () => true);
    mgr.enable();

    expect(mocks.windows).toHaveLength(1);
    const win = lastWindow();
    expect(win._opts.transparent).toBe(true);
    expect(win._opts.frame).toBe(false);
    expect(win._opts.alwaysOnTop).toBe(true);
    expect(win._opts.skipTaskbar).toBe(true);
    expect(win._opts.focusable).toBe(false);
    expect(win._opts.show).toBe(false);
  });

  it('enable() loads URL with #/overlay hash', () => {
    const mgr = makeManager(async () => true);
    mgr.enable();

    const win = lastWindow();
    if ((win.loadURL.mock.calls as string[][]).length > 0) {
      expect((win.loadURL.mock.calls as string[][])[0]![0]).toContain('#/overlay');
    } else {
      expect((win.loadFile.mock.calls as unknown[][])[0]![1]).toEqual({ hash: '/overlay' });
    }
  });

  it('setRunning(true) after enable() shows the window', () => {
    const mgr = makeManager(async () => true);
    mgr.enable();
    mgr.setRunning(true);

    expect(lastWindow().show).toHaveBeenCalled();
    expect(lastWindow().isVisible()).toBe(true);
  });

  it('setRunning(false) after 3 consecutive false polls hides the window', async () => {
    vi.useFakeTimers();
    let alive = true;
    const mgr = makeManager(async () => alive);
    mgr.enable();
    mgr.setRunning(true);
    expect(lastWindow().isVisible()).toBe(true);

    alive = false;
    // First false poll — should NOT hide yet
    await vi.advanceTimersByTimeAsync(3000);
    expect(lastWindow().isVisible()).toBe(true);

    // Second false poll — still visible
    await vi.advanceTimersByTimeAsync(3000);
    expect(lastWindow().isVisible()).toBe(true);

    // Third false poll — now hides
    await vi.advanceTimersByTimeAsync(3000);
    expect(lastWindow().hide).toHaveBeenCalled();
  });

  it('a single false followed by true does NOT hide', async () => {
    vi.useFakeTimers();
    let alive = true;
    const mgr = makeManager(async () => alive);
    mgr.enable();
    mgr.setRunning(true);

    alive = false;
    await vi.advanceTimersByTimeAsync(3000);
    expect(lastWindow().isVisible()).toBe(true);

    alive = true;
    await vi.advanceTimersByTimeAsync(3000);
    expect(lastWindow().isVisible()).toBe(true);
  });

  it('a thrown isAlive() is treated as false', async () => {
    vi.useFakeTimers();
    const mgr = makeManager(async () => { throw new Error('mirror down'); });
    mgr.enable();
    mgr.setRunning(true);

    // 3 consecutive thrown → treated as false → hide after 3 polls
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(lastWindow().hide).toHaveBeenCalled();
  });

  it('disable() hides without destroying', () => {
    const mgr = makeManager(async () => true);
    mgr.enable();
    mgr.setRunning(true);
    mgr.disable();

    expect(lastWindow().isVisible()).toBe(false);
    expect(lastWindow().isDestroyed()).toBe(false);
  });

  it('dispose() destroys the window', () => {
    const mgr = makeManager(async () => true);
    mgr.enable();
    mgr.dispose();

    expect(lastWindow().isDestroyed()).toBe(true);
  });
});
