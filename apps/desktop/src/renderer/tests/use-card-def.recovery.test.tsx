import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCardLookup } from '../src/hooks/use-card-def';

describe('card lookup recovery', () => {
  it('shares the request and recovers from a rejected IPC lookup', async () => {
    window.hdt.cards.findById = vi.fn().mockRejectedValueOnce(new Error('temporarily unavailable'))
      .mockResolvedValue({ id: 'RECOVERY_CARD', name: 'Recovered' });
    const first = renderHook(() => useCardLookup('RECOVERY_CARD'));
    const second = renderHook(() => useCardLookup('RECOVERY_CARD'));
    await waitFor(() => expect(first.result.current.error).toBe(true));
    expect(window.hdt.cards.findById).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(first.result.current.card?.name).toBe('Recovered'));
    await waitFor(() => expect(second.result.current.card?.name).toBe('Recovered'));
  });

  it('allows explicit retry and does not treat a failure as an unknown card', async () => {
    window.hdt.cards.findById = vi.fn().mockRejectedValue(new Error('unavailable'));
    const hook = renderHook(() => useCardLookup('RETRY_CARD'));
    await waitFor(() => expect(hook.result.current.error).toBe(true));
    expect(hook.result.current.card).toBeUndefined();
    vi.mocked(window.hdt.cards.findById).mockResolvedValue(null);
    act(() => hook.result.current.retry());
    await waitFor(() => expect(hook.result.current.card).toBeNull());
    expect(hook.result.current.error).toBe(false);
  });

  it('does not show a previous card when the id changes', async () => {
    window.hdt.cards.findById = vi.fn().mockResolvedValue({ id: 'OLD', name: 'Old' });
    const hook = renderHook(({ id }) => useCardLookup(id), { initialProps: { id: 'OLD' } });
    await waitFor(() => expect(hook.result.current.card?.name).toBe('Old'));
    vi.mocked(window.hdt.cards.findById).mockImplementation(() => new Promise(() => {}));
    hook.rerender({ id: 'NEW' });
    expect(hook.result.current.card).toBeUndefined();
  });
});
