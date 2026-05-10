import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHearthMirrorStatus } from '../src/hooks/use-hearthmirror-status';

describe('useHearthMirrorStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls isAlive immediately on mount', async () => {
    const spy = vi.fn().mockResolvedValue(false);
    window.hdt.hearthmirror.isAlive = spy;

    renderHook(() => useHearthMirrorStatus());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(spy).toHaveBeenCalled();
  });

  it('skips getBattleTag/getMedalInfo when isAlive=false', async () => {
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(false);
    const btSpy = vi.fn().mockResolvedValue({ name: 'X', fullBattleTag: 'X#1' });
    const miSpy = vi.fn().mockResolvedValue({ standard: null, wild: null, classic: null, twist: null });
    window.hdt.hearthmirror.getBattleTag = btSpy;
    window.hdt.hearthmirror.getMedalInfo = miSpy;

    renderHook(() => useHearthMirrorStatus());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(btSpy).not.toHaveBeenCalled();
    expect(miSpy).not.toHaveBeenCalled();
  });

  it('clears interval on unmount', async () => {
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(false);

    const { unmount } = renderHook(() => useHearthMirrorStatus());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const callsBefore = (window.hdt.hearthmirror.isAlive as ReturnType<typeof vi.fn>).mock.calls.length;
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });

    const callsAfter = (window.hdt.hearthmirror.isAlive as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callsAfter).toBe(callsBefore);
  });

  it('falls back to defaults when IPC rejects', async () => {
    window.hdt.hearthmirror.isAlive = vi.fn().mockRejectedValue(new Error('ipc fail'));

    const { result } = renderHook(() => useHearthMirrorStatus());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.isAlive).toBe(false);
    expect(result.current.battleTag).toBeNull();
    expect(result.current.medalInfo).toBeNull();
  });

  it('exposes cached profile as displayBattleTag when live tag is null', async () => {
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(false);
    window.hdt.playerProfile.get = vi.fn().mockResolvedValue({
      battleTag: { name: 'Cached', fullBattleTag: 'Cached#1' },
      accountId: null,
      lastSeenAt: 1_000,
    });

    const { result } = renderHook(() => useHearthMirrorStatus());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.isAlive).toBe(false);
    expect(result.current.battleTag).toBeNull();
    expect(result.current.displayBattleTag?.fullBattleTag).toBe('Cached#1');
    expect(result.current.cachedIdentity?.battleTag.fullBattleTag).toBe('Cached#1');
  });
});
