import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOverlayStableStateMonitor, type OverlayPanelBounds } from './overlay-stable-state-monitor';

function panelBounds(x: number): OverlayPanelBounds {
  return {
    opponent: { x, y: 10, width: 320, height: 800 },
    player: { x: x + 1000, y: 10, width: 320, height: 800 },
  };
}

describe('createOverlayStableStateMonitor', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('applies the first visible/foreground/bounds readings only after they stay stable', async () => {
    vi.useFakeTimers();
    const applyVisibility = vi.fn();
    const applyForeground = vi.fn();
    const applyBounds = vi.fn();
    const monitor = createOverlayStableStateMonitor({
      applyVisibility,
      applyForeground,
      applyBounds,
      stabilityMs: 1000,
    });

    monitor.setVisibility(true);
    monitor.setForeground(true);
    monitor.setPanelBounds(panelBounds(100));

    await vi.advanceTimersByTimeAsync(999);
    expect(applyVisibility).not.toHaveBeenCalled();
    expect(applyForeground).not.toHaveBeenCalled();
    expect(applyBounds).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(applyVisibility).toHaveBeenCalledTimes(1);
    expect(applyVisibility).toHaveBeenLastCalledWith(true);
    expect(applyForeground).toHaveBeenCalledTimes(1);
    expect(applyForeground).toHaveBeenLastCalledWith(true);
    expect(applyBounds).toHaveBeenCalledTimes(1);
    expect(applyBounds).toHaveBeenLastCalledWith(panelBounds(100));
    monitor.dispose();
  });

  it('cancels a pending visibility drop if visibility recovers within the stability window', async () => {
    vi.useFakeTimers();
    const applyVisibility = vi.fn();
    const monitor = createOverlayStableStateMonitor({
      applyVisibility,
      applyForeground: vi.fn(),
      applyBounds: vi.fn(),
      stabilityMs: 1000,
    });

    monitor.setVisibility(true);
    await vi.advanceTimersByTimeAsync(1000);
    applyVisibility.mockClear();

    monitor.setVisibility(false);
    await vi.advanceTimersByTimeAsync(600);
    monitor.setVisibility(true);
    await vi.advanceTimersByTimeAsync(1000);

    expect(applyVisibility).not.toHaveBeenCalled();
    monitor.dispose();
  });

  it('coalesces jittery bounds and applies only the latest stable rectangle', async () => {
    vi.useFakeTimers();
    const applyBounds = vi.fn();
    const monitor = createOverlayStableStateMonitor({
      applyVisibility: vi.fn(),
      applyForeground: vi.fn(),
      applyBounds,
      stabilityMs: 1000,
    });

    monitor.setPanelBounds(panelBounds(100));
    await vi.advanceTimersByTimeAsync(700);
    monitor.setPanelBounds(panelBounds(101));
    await vi.advanceTimersByTimeAsync(700);
    monitor.setPanelBounds(panelBounds(102));

    await vi.advanceTimersByTimeAsync(999);
    expect(applyBounds).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(applyBounds).toHaveBeenCalledTimes(1);
    expect(applyBounds).toHaveBeenLastCalledWith(panelBounds(102));
    monitor.dispose();
  });

  it('reset clears applied state so re-enabled overlays receive the next stable reading', async () => {
    vi.useFakeTimers();
    const applyVisibility = vi.fn();
    const monitor = createOverlayStableStateMonitor({
      applyVisibility,
      applyForeground: vi.fn(),
      applyBounds: vi.fn(),
      stabilityMs: 1000,
    });

    monitor.setVisibility(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(applyVisibility).toHaveBeenCalledTimes(1);

    applyVisibility.mockClear();
    monitor.setVisibility(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(applyVisibility).not.toHaveBeenCalled();

    monitor.reset();
    monitor.setVisibility(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(applyVisibility).toHaveBeenCalledTimes(1);
    expect(applyVisibility).toHaveBeenLastCalledWith(true);
    monitor.dispose();
  });

  it('dispose clears pending timers', async () => {
    vi.useFakeTimers();
    const applyForeground = vi.fn();
    const monitor = createOverlayStableStateMonitor({
      applyVisibility: vi.fn(),
      applyForeground,
      applyBounds: vi.fn(),
      stabilityMs: 1000,
    });

    monitor.setForeground(true);
    monitor.dispose();
    await vi.advanceTimersByTimeAsync(1000);

    expect(applyForeground).not.toHaveBeenCalled();
  });
});
