import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const windows: MockWindow[] = [];

  class MockWindow {
    _opts: Record<string, unknown>;
    _listeners: Record<string, Array<() => void>> = {};
    webContents = { on: vi.fn() };

    constructor(opts: Record<string, unknown>) {
      this._opts = opts;
      windows.push(this);
    }

    loadURL = vi.fn(() => Promise.resolve());
    loadFile = vi.fn(() => Promise.resolve());
    setBackgroundMaterial = vi.fn();
    on = vi.fn((event: string, handler: () => void) => {
      (this._listeners[event] ??= []).push(handler);
      return this;
    });

    _emit(event: string): void {
      const handlers = this._listeners[event];
      if (!handlers) return;
      for (const handler of handlers) handler();
    }
  }

  return {
    windows,
    MockWindow,
    BrowserWindow: vi.fn((opts: Record<string, unknown>) => new MockWindow(opts)),
    app: {
      getAppPath: vi.fn(() => 'D:\\fake-app'),
    },
    nativeImage: {
      createFromPath: vi.fn(),
    },
  };
});

vi.mock('electron', () => ({
  app: mocks.app,
  BrowserWindow: mocks.BrowserWindow,
  nativeImage: mocks.nativeImage,
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
  },
  existsSync: vi.fn(() => false),
}));

import { createMainWindow } from './window';

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
const originalRendererUrl = process.env['ELECTRON_RENDERER_URL'];

function stubPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform,
  });
}

function lastWindow(): InstanceType<typeof mocks.MockWindow> {
  return mocks.windows[mocks.windows.length - 1]!;
}

beforeEach(() => {
  mocks.windows.length = 0;
  vi.clearAllMocks();
  vi.useRealTimers();
  process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173';
});

afterEach(() => {
  if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
  if (originalRendererUrl === undefined) {
    delete process.env['ELECTRON_RENDERER_URL'];
  } else {
    process.env['ELECTRON_RENDERER_URL'] = originalRendererUrl;
  }
  vi.useRealTimers();
});

describe('createMainWindow', () => {
  it('enables transparent Windows acrylic material at creation', () => {
    stubPlatform('win32');

    const win = createMainWindow();

    expect(mocks.BrowserWindow).toHaveBeenCalledTimes(1);
    expect(lastWindow()).toBe(win);
    expect(lastWindow()._opts.backgroundColor).toBe('#00000000');
    expect(lastWindow()._opts.backgroundMaterial).toBe('acrylic');
    expect(lastWindow()._opts.titleBarStyle).toBe('hidden');
    expect(lastWindow()._opts.titleBarOverlay).toEqual({
      color: '#00000000',
      symbolColor: '#C8C8CD',
      height: 32,
    });
    expect(lastWindow().setBackgroundMaterial).toHaveBeenCalledWith('acrylic');
  });

  it('does not disable acrylic during maximize and restore transitions', () => {
    stubPlatform('win32');

    createMainWindow();
    const win = lastWindow();
    win.setBackgroundMaterial.mockClear();

    win._emit('maximize');
    win._emit('unmaximize');
    win._emit('restore');
    win._emit('resize');

    expect(win.setBackgroundMaterial).not.toHaveBeenCalled();
    expect(win.setBackgroundMaterial).not.toHaveBeenCalledWith('none');
  });
});
