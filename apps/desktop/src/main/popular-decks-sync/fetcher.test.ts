import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchHsguruArchetypeVariants, fetchHsguruMeta, fetchHsguruText } from './fetcher';

function okResponse(body: string): Response {
  return new Response(body, { status: 200, statusText: 'OK' });
}

describe('fetchHsguruText', () => {
  it('returns the response text on 200', async () => {
    const fetchImpl = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => okResponse('<html>hi</html>'),
    );
    const html = await fetchHsguruText('https://example.test/', { fetchImpl });
    expect(html).toBe('<html>hi</html>');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const init = fetchImpl.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers['user-agent']).toContain('Mozilla');
    expect(headers['accept']).toContain('text/html');
  });

  it('throws on non-2xx response', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('boom', { status: 503, statusText: 'Service Unavailable' }),
    );
    await expect(
      fetchHsguruText('https://example.test/', { fetchImpl }),
    ).rejects.toThrow(/503/);
  });

  it('rejects with AbortError when the outer signal is already aborted', async () => {
    const fetchImpl = vi.fn(async () => okResponse('x'));
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchHsguruText('https://example.test/', { fetchImpl }, controller.signal),
    ).rejects.toThrow(/aborted/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('fetchHsguruMeta', () => {
  it('hits the legend meta URL', async () => {
    const fetchImpl = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => okResponse('<html/>'),
    );
    await fetchHsguruMeta({ fetchImpl });
    const url = fetchImpl.mock.calls[0]![0];
    expect(url).toBe('https://www.hsguru.com/meta?rank=legend&sort_by=total');
  });
});

describe('fetchHsguruArchetypeVariants', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the first candidate URL that produces non-empty HTML', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('player_deck_archetype')) return okResponse('');
      if (url.includes('archetype=')) return okResponse('<html>variants</html>');
      return okResponse('');
    });
    const delay = vi.fn(async () => undefined);
    const result = await fetchHsguruArchetypeVariants('Tempo Rogue', { fetchImpl, delay });
    expect(result?.html).toBe('<html>variants</html>');
    expect(result?.url).toContain('archetype=');
  });

  it('aborts mid-loop when signal is aborted', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () => {
      controller.abort();
      return okResponse('');
    });
    const delay = vi.fn(async () => undefined);
    await expect(
      fetchHsguruArchetypeVariants('Tempo Rogue', { fetchImpl, delay }, controller.signal),
    ).rejects.toThrow(/aborted/);
    // Should have stopped after the first attempt aborted us.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
