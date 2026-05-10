import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const windows: MockWindow[] = [];

  class MockWindow {
    _opts: Record<string, unknown>;
    _bounds: { x: number; y: number; width: number; height: number };
    webContents = { send: vi.fn() };

    constructor(opts: Record<string, unknown>) {
      this._opts = opts;
      this._bounds = {
        x: (opts['x'] as number) ?? 0,
        y: (opts['y'] as number) ?? 0,
        width: (opts['width'] as number) ?? 0,
        height: (opts['height'] as number) ?? 0,
      };
      windows.push(this);
    }

    isDestroyed = vi.fn(() => false);
    setBounds = vi.fn((bounds: { x: number; y: number; width: number; height: number }) => {
      this._bounds = bounds;
    });
    setAlwaysOnTop = vi.fn();
    setIgnoreMouseEvents = vi.fn();
    setOpacity = vi.fn();
    show = vi.fn();
    destroy = vi.fn();
    loadURL = vi.fn(() => Promise.resolve());
    loadFile = vi.fn(() => Promise.resolve());
  }

  return {
    windows,
    MockWindow,
    BrowserWindow: vi.fn((opts: Record<string, unknown>) => new MockWindow(opts)),
    screen: {
      getDisplayNearestPoint: vi.fn(() => ({
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      })),
    },
  };
});

vi.mock('electron', () => ({
  BrowserWindow: mocks.BrowserWindow,
  screen: mocks.screen,
}));

import { CardPreviewWindow } from './card-preview-window';

function createPreview(): CardPreviewWindow {
  return new CardPreviewWindow({
    rendererUrl: '/fake/renderer/index.html',
    preloadPath: '/fake/preload.js',
  });
}

function lastWindow(): InstanceType<typeof mocks.MockWindow> {
  return mocks.windows[mocks.windows.length - 1]!;
}

beforeEach(() => {
  mocks.windows.length = 0;
  vi.clearAllMocks();
  delete process.env['ELECTRON_RENDERER_URL'];
});

describe('CardPreviewWindow', () => {
  it('flips a requested right-side preview to the left when it would leave the display', () => {
    const preview = createPreview();

    preview.show('CS2_029', {
      x: 1500,
      y: 260,
      width: 300,
      height: 24,
      side: 'right',
    });

    expect(lastWindow().setBounds).toHaveBeenCalledWith({
      x: 1212,
      y: 72,
      width: 280,
      height: 400,
    });
  });

  it('clamps pool previews inside the display work area', () => {
    const preview = createPreview();

    preview.showPool(['a', 'b', 'c'], {
      x: 1500,
      y: 260,
      width: 300,
      height: 24,
      side: 'right',
    });

    const bounds = lastWindow().setBounds.mock.calls[0]![0] as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1920);
  });
});
